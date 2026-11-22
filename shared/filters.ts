import { z as zod } from 'zod';

export const PROPERTY_TYPE_CODES = [
  'apartment',
  'duplex',
  'penthouse',
  'garden_apartment',
  'roof_apartment',
  'private_house',
] as const;

export const CONDITION_CODES = ['new_from_developer', 'renovated', 'good', 'well_kept', 'needs_renovation'] as const;

export const SORT_OPTIONS = [
  'date_desc',
  'date_asc',
  'price_asc',
  'price_desc',
  'price_per_sqm_asc',
  'price_per_sqm_desc',
  'size_asc',
  'size_desc',
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const SORT_LABELS_HE: Record<SortOption, string> = {
  date_desc: 'תאריך עסקה: מהחדש לישן',
  date_asc: 'תאריך עסקה: מהישן לחדש',
  price_asc: 'מחיר: מהנמוך לגבוה',
  price_desc: 'מחיר: מהגבוה לנמוך',
  price_per_sqm_asc: 'מחיר למ"ר: מהנמוך לגבוה',
  price_per_sqm_desc: 'מחיר למ"ר: מהגבוה לנמוך',
  size_asc: 'שטח: מהקטן לגדול',
  size_desc: 'שטח: מהגדול לקטן',
};

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const isoDate = zod
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a date as YYYY-MM-DD')
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, 'not a real calendar date');

const names = zod.array(zod.string().trim().min(1).max(100)).max(20);

/** Rooms are counted in halves in Israel: 3, 3.5, 4, 4.5 ... */
const rooms = zod.number().min(1).max(20).multipleOf(0.5);

/**
 * All fields are optional; an empty object means "everything".
 * Lists (cities, ...) are OR within the field; different fields are AND.
 * Min/max bounds are inclusive. Deals where the filtered value is unknown (null) never match that bound.
 */
export const FiltersSchema = zod
  .strictObject({
    cities: names.optional(),
    neighborhoods: names.optional(),
    streets: names.optional(),
    property_types: zod.array(zod.enum(PROPERTY_TYPE_CODES)).max(PROPERTY_TYPE_CODES.length).optional(),
    conditions: zod.array(zod.enum(CONDITION_CODES)).max(CONDITION_CODES.length).optional(),

    rooms_min: rooms.optional(),
    rooms_max: rooms.optional(),
    price_min: zod.number().min(0).optional(),
    price_max: zod.number().min(0).optional(),
    size_min: zod.number().min(0).optional(),
    size_max: zod.number().min(0).optional(),
    price_per_sqm_min: zod.number().min(0).optional(),
    price_per_sqm_max: zod.number().min(0).optional(),
    floor_min: zod.number().int().min(-5).max(120).optional(),
    floor_max: zod.number().int().min(-5).max(120).optional(),
    year_built_min: zod.number().int().min(1800).max(2100).optional(),
    year_built_max: zod.number().int().min(1800).max(2100).optional(),

    /** Inclusive. A month-only deal matches when any day of its month falls inside the range. */
    deal_date_from: isoDate.optional(),
    deal_date_to: isoDate.optional(),

    /** true = must have, false = must not have. Omit = don't care. */
    has_elevator: zod.boolean().optional(),
    has_parking: zod.boolean().optional(),
    has_balcony: zod.boolean().optional(),
    has_safe_room: zod.boolean().optional(),
  })
  // run extra check after each field passed validation
  .superRefine((f, ctx) => {
    const pairs = [
      ['rooms_min', 'rooms_max'],
      ['price_min', 'price_max'],
      ['size_min', 'size_max'],
      ['price_per_sqm_min', 'price_per_sqm_max'],
      ['floor_min', 'floor_max'],
      ['year_built_min', 'year_built_max'],
      ['deal_date_from', 'deal_date_to'],
    ] as const;
    for (const [lo, hi] of pairs) {
      const a = f[lo];
      const b = f[hi];
      if (a !== undefined && b !== undefined && a > b) {
        ctx.addIssue({ code: 'custom', path: [lo], message: `${lo} must not be greater than ${hi}` });
      }
    }
  });
export type Filters = zod.infer<typeof FiltersSchema>;

/**
 * Exactly one of `filters` (manual search, no LLM) or `query` (free text, LLM) must be given.
 */
export const SearchRequestSchema = zod
  .strictObject({
    filters: FiltersSchema.optional(),
    query: zod.string().trim().min(1).max(500).optional(),
    sort: zod.enum(SORT_OPTIONS).default('date_desc'),
    page: zod.number().int().min(1).default(1),
    page_size: zod.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .superRefine((req, ctx) => {
    const hasFilters = req.filters !== undefined;
    const hasQuery = req.query !== undefined;
    if (hasFilters === hasQuery) {
      ctx.addIssue({ code: 'custom', message: 'provide exactly one of "filters" or "query"' });
    }
  });
export type SearchRequest = zod.infer<typeof SearchRequestSchema>;
