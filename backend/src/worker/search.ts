import { cleanText, lookupKey } from '../../../shared/cleaners.js';
import type { Filters, SearchRequest, SortOption } from '../../../shared/filters.js';
import { canonicalCity, canonicalNeighborhood } from '../../../shared/aliases.js';
import type { SlimDeal } from '../../../shared/types.js';
import type { Dataset, Entry } from './dataset.js';

export interface SearchResponse {
  /** The filters that were actually applied (names normalized, e.g. ב"ש -> באר שבע). */
  filters: Filters;
  /** true when the filters came from the LLM; always false for manual search. */
  interpreted: boolean;
  warnings: string[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: SlimDeal[];
}

// --------------------------------------------------------------------------
// Normalising names in the filters
// --------------------------------------------------------------------------
const unique = <T>(items: T[]) => [...new Set(items)];

export function normalizeFilters(input: Filters, ds: Dataset): { filters: Filters; warnings: string[] } {
  const warnings: string[] = [];
  const filters: Filters = { ...input };

  if (input.cities) {
    filters.cities = unique(
      input.cities.map((raw) => {
        const name = canonicalCity(raw) ?? cleanText(raw);
        if (!ds.cityNames.has(name)) warnings.push(`עיר לא מוכרת: ${raw}`);
        return name;
      }),
    );
  }
  if (input.neighborhoods) {
    filters.neighborhoods = unique(
      input.neighborhoods.map((raw) => {
        const name = canonicalNeighborhood(cleanText(raw)) ?? cleanText(raw);
        const known = ds.neighborhoodByKey.get(lookupKey(name));
        if (!known) warnings.push(`שכונה לא מוכרת: ${raw}`);
        return known ?? name;
      }),
    );
  }
  if (input.streets) {
    filters.streets = unique(
      input.streets.map((raw) => {
        const name = cleanText(raw);
        const known = ds.streetByKey.get(lookupKey(name));
        if (!known) warnings.push(`רחוב לא מוכר: ${raw}`);
        return known ?? name;
      }),
    );
  }
  return { filters, warnings };
}

// --------------------------------------------------------------------------
// Matching
// --------------------------------------------------------------------------
/** A missing (null) value never satisfies an active bound. */
function inRange(value: number | null, min: number | undefined, max: number | undefined): boolean {
  if (min === undefined && max === undefined) return true;
  if (value === null) return false;
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

function compile(f: Filters): (e: Entry) => boolean {
  const cities = f.cities?.length ? new Set(f.cities) : null;
  const hoods = f.neighborhoods?.length ? new Set(f.neighborhoods.map(lookupKey)) : null;
  const streets = f.streets?.length ? new Set(f.streets.map(lookupKey)) : null;
  const types = f.property_types?.length ? new Set<string>(f.property_types) : null;
  const conditions = f.conditions?.length ? new Set<string>(f.conditions) : null;

  return ({ deal: d, neighborhoodKey, streetKey, dateStart, dateEnd }) => {
    if (cities && !cities.has(d.city)) return false;
    if (hoods && (neighborhoodKey === null || !hoods.has(neighborhoodKey))) return false;
    if (streets && (streetKey === null || !streets.has(streetKey))) return false;
    if (types && !types.has(d.property_type)) return false;
    if (conditions && (d.condition === null || !conditions.has(d.condition))) return false;

    if (!inRange(d.rooms, f.rooms_min, f.rooms_max)) return false;
    if (!inRange(d.price_nis, f.price_min, f.price_max)) return false;
    if (!inRange(d.size_sqm, f.size_min, f.size_max)) return false;
    if (!inRange(d.price_per_sqm, f.price_per_sqm_min, f.price_per_sqm_max)) return false;
    if (!inRange(d.floor, f.floor_min, f.floor_max)) return false;
    if (!inRange(d.year_built, f.year_built_min, f.year_built_max)) return false;

    // ISO dates compare correctly as strings. Overlap test, so month-only deals match by month.
    if (f.deal_date_from !== undefined && dateEnd < f.deal_date_from) return false;
    if (f.deal_date_to !== undefined && dateStart > f.deal_date_to) return false;

    if (f.has_elevator !== undefined && d.has_elevator !== f.has_elevator) return false;
    if (f.has_parking !== undefined && d.has_parking !== f.has_parking) return false;
    if (f.has_balcony !== undefined && d.has_balcony !== f.has_balcony) return false;
    if (f.has_safe_room !== undefined && d.has_safe_room !== f.has_safe_room) return false;
    return true;
  };
}

// --------------------------------------------------------------------------
// Sorting (unknown values always last, ties broken by newest date then id)
// --------------------------------------------------------------------------
const SORT_KEYS: Record<SortOption, { value: (d: SlimDeal) => number | string | null; dir: 1 | -1 }> = {
  date_desc: { value: (d) => d.deal_date, dir: -1 },
  date_asc: { value: (d) => d.deal_date, dir: 1 },
  price_asc: { value: (d) => d.price_nis, dir: 1 },
  price_desc: { value: (d) => d.price_nis, dir: -1 },
  price_per_sqm_asc: { value: (d) => d.price_per_sqm, dir: 1 },
  price_per_sqm_desc: { value: (d) => d.price_per_sqm, dir: -1 },
  size_asc: { value: (d) => d.size_sqm, dir: 1 },
  size_desc: { value: (d) => d.size_sqm, dir: -1 },
};

function comparator(sort: SortOption): (a: SlimDeal, b: SlimDeal) => number {
  const { value, dir } = SORT_KEYS[sort];
  return (a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va !== vb) {
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va < vb ? -1 : 1) * dir;
    }
    if (a.deal_date !== b.deal_date) return a.deal_date < b.deal_date ? 1 : -1;
    return a.deal_id < b.deal_id ? -1 : a.deal_id > b.deal_id ? 1 : 0;
  };
}

// --------------------------------------------------------------------------
// Public entry point: manual (filter-based) search. No LLM involved.
// --------------------------------------------------------------------------
export function searchDeals(
  ds: Dataset,
  request: Pick<SearchRequest, 'sort' | 'page' | 'page_size'> & { filters: Filters },
): SearchResponse {
  const { filters, warnings } = normalizeFilters(request.filters, ds);
  const matching = ds.entries.filter(compile(filters)).map((e) => e.deal).sort(comparator(request.sort));

  const total = matching.length;
  const start = (request.page - 1) * request.page_size;
  return {
    filters,
    interpreted: false,
    warnings,
    total,
    page: request.page,
    page_size: request.page_size,
    total_pages: Math.ceil(total / request.page_size),
    results: matching.slice(start, start + request.page_size),
  };
}
