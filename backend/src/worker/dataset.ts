import { lookupKey } from '../../../shared/cleaners.js';
import {
  CONDITION_CODES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PROPERTY_TYPE_CODES,
  SORT_LABELS_HE,
  SORT_OPTIONS,
} from '../../../shared/filters.js';
import { CONDITION_HE, PROPERTY_TYPE_HE, SOURCE_HE } from '../../../shared/aliases.js';
import type { SlimDeal } from '../../../shared/types.js';

/** A deal plus the precomputed values the search needs (computed once, at Worker start-up). */
export interface Entry {
  deal: SlimDeal;
  neighborhoodKey: string | null;
  streetKey: string | null;
  /** First and last day (ISO) the deal could have happened; equal for day-precision deals. */
  dateStart: string;
  dateEnd: string;
}

export interface Meta {
  total_deals: number;
  cities: Array<{ name: string; count: number; neighborhoods: Array<{ name: string; count: number }> }>;
  property_types: Array<{ code: string; label_he: string; count: number }>;
  conditions: Array<{ code: string; label_he: string; count: number }>;
  sources: Array<{ code: string; label_he: string; count: number }>;
  ranges: {
    price_nis: Range;
    size_sqm: Range;
    rooms: Range;
    price_per_sqm: Range;
    floor: Range;
    year_built: Range;
    deal_date: { min: string | null; max: string | null };
  };
  sort_options: Array<{ code: string; label_he: string }>;
  paging: { default_page_size: number; max_page_size: number };
}
type Range = { min: number | null; max: number | null };

export interface Dataset {
  entries: Entry[];
  cityNames: Set<string>;
  /** lookupKey(name) -> display name, for warning about unknown neighborhoods / streets. */
  neighborhoodByKey: Map<string, string>;
  streetByKey: Map<string, string>;
  meta: Meta;
}

const pad = (n: number) => String(n).padStart(2, '0');

function lastDayOfMonth(year: number, month: number): string {
  return `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
}

const rangeOf = (values: Array<number | null>): Range => {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : { min: null, max: null };
};

const countBy = <T>(items: T[], pick: (t: T) => string | null): Map<string, number> => {
  const m = new Map<string, number>();
  for (const i of items) {
    const k = pick(i);
    if (k !== null) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};

const byHebrew = (a: string, b: string) => a.localeCompare(b, 'he');

export function createDataset(deals: SlimDeal[]): Dataset {
  const entries: Entry[] = deals.map((deal) => ({
    deal,
    neighborhoodKey: deal.neighborhood ? lookupKey(deal.neighborhood) : null,
    streetKey: deal.street ? lookupKey(deal.street) : null,
    dateStart: deal.deal_date,
    dateEnd: deal.deal_date_precision === 'month' ? lastDayOfMonth(deal.deal_year, deal.deal_month) : deal.deal_date,
  }));

  const neighborhoodByKey = new Map<string, string>();
  const streetByKey = new Map<string, string>();
  for (const d of deals) {
    if (d.neighborhood) neighborhoodByKey.set(lookupKey(d.neighborhood), d.neighborhood);
    if (d.street) streetByKey.set(lookupKey(d.street), d.street);
  }

  const cities = [...new Set(deals.map((d) => d.city))].sort(byHebrew).map((name) => {
    const inCity = deals.filter((d) => d.city === name);
    const hoods = countBy(inCity, (d) => d.neighborhood);
    return {
      name,
      count: inCity.length,
      neighborhoods: [...hoods].sort(([a], [b]) => byHebrew(a, b)).map(([n, count]) => ({ name: n, count })),
    };
  });

  const typeCounts = countBy(deals, (d) => d.property_type);
  const conditionCounts = countBy(deals, (d) => d.condition);
  const sourceCounts = countBy(deals, (d) => d.source);
  const dates = deals.map((d) => d.deal_date).sort();

  const meta: Meta = {
    total_deals: deals.length,
    cities,
    property_types: PROPERTY_TYPE_CODES.map((code) => ({ code, label_he: PROPERTY_TYPE_HE[code], count: typeCounts.get(code) ?? 0 })),
    conditions: CONDITION_CODES.map((code) => ({ code, label_he: CONDITION_HE[code], count: conditionCounts.get(code) ?? 0 })),
    sources: (Object.keys(SOURCE_HE) as Array<keyof typeof SOURCE_HE>).map((code) => ({
      code,
      label_he: SOURCE_HE[code],
      count: sourceCounts.get(code) ?? 0,
    })),
    ranges: {
      price_nis: rangeOf(deals.map((d) => d.price_nis)),
      size_sqm: rangeOf(deals.map((d) => d.size_sqm)),
      rooms: rangeOf(deals.map((d) => d.rooms)),
      price_per_sqm: rangeOf(deals.map((d) => d.price_per_sqm)),
      floor: rangeOf(deals.map((d) => d.floor)),
      year_built: rangeOf(deals.map((d) => d.year_built)),
      deal_date: { min: dates[0] ?? null, max: dates.at(-1) ?? null },
    },
    sort_options: SORT_OPTIONS.map((code) => ({ code, label_he: SORT_LABELS_HE[code] })),
    paging: { default_page_size: DEFAULT_PAGE_SIZE, max_page_size: MAX_PAGE_SIZE },
  };

  return { entries, cityNames: new Set(deals.map((d) => d.city)), neighborhoodByKey, streetByKey, meta };
}
