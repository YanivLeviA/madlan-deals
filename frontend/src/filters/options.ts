import { CONDITION_CODES, PROPERTY_TYPE_CODES } from '../../../shared/filters';
import type { Condition } from '../../../shared/types';
import type { Option } from '../components/fields';
import type { DatasetMeta } from '../api';
import {
  CUSTOM_DATE,
  dateRangeLabel,
  formatPrice,
  type FilterState,
  type PropertyTypeCode,
} from './filterState';

export interface FilterOptions {
  cities: Option[];
  rooms: Option[];
  prices: Option[];
  years: Option[];
  propertyTypes: Array<[PropertyTypeCode, string]>;
  conditions: Array<[Condition, string]>;
}

const PRICE_STEPS = [
  500_000, 750_000, 1_000_000, 1_250_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000, 3_500_000, 4_000_000, 5_000_000,
  6_000_000, 8_000_000, 10_000_000, 12_000_000, 15_000_000, 20_000_000, 30_000_000,
];

const empty: FilterOptions = { cities: [], rooms: [], prices: [], years: [], propertyTypes: [], conditions: [] };

const withCurrent = (options: Option[], value: string, label: string): Option[] =>
  value && !options.some((o) => o.value === value) ? [{ value, label }, ...options] : options;

/** Dropdown and chip choices for the sidebar, taken from GET /api/meta. */
export function buildFilterOptions(meta: DatasetMeta | null, filters: FilterState): FilterOptions {
  if (!meta) return empty;

  // Used by both the "from" and the "to" rooms selects; keeps a value that came from an LLM query even if it is not listed.
  let rooms = roomOptions(meta.ranges.rooms);
  for (const current of [filters.roomsMin, filters.roomsMax]) rooms = withCurrent(rooms, current, current);
  rooms.sort((a, b) => Number(a.value) - Number(b.value));

  const years = yearOptions(meta.ranges.deal_date);
  const customDates = !filters.dealYear && (filters.dealDateFrom || filters.dealDateTo);
  const yearChoices = customDates
    ? [{ value: CUSTOM_DATE, label: dateRangeLabel(filters.dealDateFrom, filters.dealDateTo) }, ...years]
    : years;

  return {
    cities: withCurrent(
      meta.cities.map((c) => ({ value: c.name, label: c.name })),
      filters.city,
      filters.city,
    ),
    rooms,
    prices: priceOptions(meta.ranges.price_nis, filters.priceMax),
    years: withCurrent(yearChoices, filters.dealYear, filters.dealYear),
    propertyTypes: codes(meta.property_types, PROPERTY_TYPE_CODES),
    conditions: codes(meta.conditions, CONDITION_CODES),
  };
}

function roomOptions(range: { min: number | null; max: number | null }): Option[] {
  if (range.min === null || range.max === null) return [];
  const start = Math.round(Math.max(1, range.min) * 2);
  const end = Math.round(Math.min(20, range.max) * 2);
  const options: Option[] = [];
  for (let half = start; half <= end; half++) {
    const value = String(half / 2);
    options.push({ value, label: value });
  }
  return options;
}

function priceOptions(range: { min: number | null; max: number | null }, current: string): Option[] {
  const hi = range.max;
  const steps = PRICE_STEPS.filter((n) => hi === null || n <= hi);
  if (hi !== null && (steps.length === 0 || steps[steps.length - 1]! < hi)) {
    const rounded = Math.ceil(hi / 100_000) * 100_000;
    if (!steps.includes(rounded)) steps.push(rounded);
  }
  const options = steps.map((n) => ({ value: String(n), label: formatPrice(n) }));
  if (!current || options.some((o) => o.value === current)) return options;
  return [...options, { value: current, label: formatPrice(Number(current)) }].sort((a, b) => Number(a.value) - Number(b.value));
}

function yearOptions(range: { min: string | null; max: string | null }): Option[] {
  if (!range.min || !range.max) return [];
  const from = Number(range.min.slice(0, 4));
  const to = Number(range.max.slice(0, 4));
  if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) return [];
  const years: Option[] = [];
  for (let year = to; year >= from; year--) years.push({ value: String(year), label: String(year) });
  return years;
}

function codes<T extends string>(items: Array<{ code: string; label_he: string }>, allowed: readonly T[]): Array<[T, string]> {
  const known = new Set<string>(allowed);
  return items.flatMap((item) => (known.has(item.code) ? [[item.code as T, item.label_he] as [T, string]] : []));
}
