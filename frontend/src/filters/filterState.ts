import { CONDITION_HE, PROPERTY_TYPE_HE } from '../../../shared/aliases';
import type { Filters } from '../../../shared/filters';
import type { Condition, PropertyType } from '../../../shared/types';

export type PropertyTypeCode = Exclude<PropertyType, 'other'>;

/** Yes / No / "don't care" for building features. */
export type Tri = 'any' | 'yes' | 'no';

/**
 * Everything the filter panel edits. Inputs are kept as strings (as typed / selected);
 * '' means "no limit". `toFilters` converts this into the API's `Filters` shape.
 */
export interface FilterState {
  // מסננים נפוצים
  city: string;
  roomsMin: string;
  priceMax: string;
  // מיקום
  neighborhood: string;
  street: string;
  // פרטי הנכס
  propertyTypes: PropertyTypeCode[];
  conditions: Condition[];
  sizeMin: string;
  sizeMax: string;
  floorMin: string;
  floorMax: string;
  yearBuiltMin: string;
  yearBuiltMax: string;
  // מאפייני הבניין
  elevator: Tri;
  parking: Tri;
  balcony: Tri;
  safeRoom: Tri;
  // פרטי העסקה
  dealYear: string;
  /** Exact dates from the last response. A full calendar year is also mirrored in `dealYear`. */
  dealDateFrom: string;
  dealDateTo: string;
  priceMin: string;
  /** Kept so a response that sets a minimum still round-trips; the form only edits the maximum. */
  pricePerSqmMin: string;
  pricePerSqmMax: string;
  /** Set when the response asked for an upper bound. Cleared when the user picks a new "rooms from" option. */
  roomsMax: string;
}

export const emptyFilters: FilterState = {
  city: '',
  roomsMin: '',
  priceMax: '',
  neighborhood: '',
  street: '',
  propertyTypes: [],
  conditions: [],
  sizeMin: '',
  sizeMax: '',
  floorMin: '',
  floorMax: '',
  yearBuiltMin: '',
  yearBuiltMax: '',
  elevator: 'any',
  parking: 'any',
  balcony: 'any',
  safeRoom: 'any',
  dealYear: '',
  dealDateFrom: '',
  dealDateTo: '',
  priceMin: '',
  pricePerSqmMin: '',
  pricePerSqmMax: '',
  roomsMax: '',
};

/** Select value used when the response dates are not a whole calendar year. */
export const CUSTOM_DATE = '__date_range__';

const isoDisplay = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

/** "01/06/2023 – 31/08/2023", "מ-01/01/2023", or "עד 31/12/2022". */
export function dateRangeLabel(from: string, to: string): string {
  if (from && to) return `${isoDisplay(from)} – ${isoDisplay(to)}`;
  if (from) return `מ-${isoDisplay(from)}`;
  if (to) return `עד ${isoDisplay(to)}`;
  return '';
}

/** The year, when the range is exactly 1 January through 31 December. */
function fullYear(from: string, to: string): string {
  const match = /^(\d{4})-01-01$/.exec(from);
  return match && to === `${match[1]}-12-31` ? match[1]! : '';
}

// --------------------------------------------------------------------------
// Labels
// --------------------------------------------------------------------------
export const PROPERTY_TYPE_OPTIONS = Object.entries(PROPERTY_TYPE_HE) as Array<[PropertyTypeCode, string]>;
export const CONDITION_OPTIONS = Object.entries(CONDITION_HE) as Array<[Condition, string]>;

export const FEATURES = [
  { key: 'elevator', label: 'מעלית', noun: 'מעלית' },
  { key: 'parking', label: 'חניה', noun: 'חניה' },
  { key: 'balcony', label: 'מרפסת', noun: 'מרפסת' },
  { key: 'safeRoom', label: 'ממ״ד', noun: 'ממ״ד' },
] as const satisfies ReadonlyArray<{ key: keyof FilterState; label: string; noun: string }>;

export const formatNumber = (n: number) => new Intl.NumberFormat('he-IL').format(n);
export const formatPrice = (n: number) => `₪${formatNumber(n)}`;

// --------------------------------------------------------------------------
// UI state <-> API filters
// --------------------------------------------------------------------------
const num = (s: string): number | undefined => {
  const n = Number(s.replace(/[,\s]/g, ''));
  return s.trim() !== '' && Number.isFinite(n) ? n : undefined;
};

const text = (n: number | undefined) => (n === undefined ? '' : String(n));

/** "חולון, רמת גן" -> ["חולון", "רמת גן"]. City names in this dataset have no commas. */
const names = (s: string): string[] | undefined => {
  const parts = s.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
};

const tri = (t: Tri): boolean | undefined => (t === 'yes' ? true : t === 'no' ? false : undefined);

const triFrom = (value: boolean | undefined): Tri => (value === true ? 'yes' : value === false ? 'no' : 'any');

/** Drops everything that is empty / "no limit", so the result only has real filters. */
export function toFilters(s: FilterState): Filters {
  const f: Filters = {
    cities: names(s.city),
    neighborhoods: names(s.neighborhood),
    streets: names(s.street),
    property_types: s.propertyTypes.length ? s.propertyTypes : undefined,
    conditions: s.conditions.length ? s.conditions : undefined,
    rooms_min: num(s.roomsMin),
    rooms_max: num(s.roomsMax),
    price_min: num(s.priceMin),
    price_max: num(s.priceMax),
    size_min: num(s.sizeMin),
    size_max: num(s.sizeMax),
    price_per_sqm_min: num(s.pricePerSqmMin),
    price_per_sqm_max: num(s.pricePerSqmMax),
    floor_min: num(s.floorMin),
    floor_max: num(s.floorMax),
    year_built_min: num(s.yearBuiltMin),
    year_built_max: num(s.yearBuiltMax),
    deal_date_from: s.dealDateFrom || (s.dealYear ? `${s.dealYear}-01-01` : undefined),
    deal_date_to: s.dealDateTo || (s.dealYear ? `${s.dealYear}-12-31` : undefined),
    has_elevator: tri(s.elevator),
    has_parking: tri(s.parking),
    has_balcony: tri(s.balcony),
    has_safe_room: tri(s.safeRoom),
  };
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) as Filters;
}

/** Fills the form from the filters the API actually applied. */
export function fromFilters(f: Filters): FilterState {
  const dealDateFrom = f.deal_date_from ?? '';
  const dealDateTo = f.deal_date_to ?? '';
  return {
    city: (f.cities ?? []).join(', '),
    roomsMin: text(f.rooms_min),
    roomsMax: text(f.rooms_max),
    priceMax: text(f.price_max),
    neighborhood: (f.neighborhoods ?? []).join(', '),
    street: (f.streets ?? []).join(', '),
    propertyTypes: f.property_types ?? [],
    conditions: f.conditions ?? [],
    sizeMin: text(f.size_min),
    sizeMax: text(f.size_max),
    floorMin: text(f.floor_min),
    floorMax: text(f.floor_max),
    yearBuiltMin: text(f.year_built_min),
    yearBuiltMax: text(f.year_built_max),
    elevator: triFrom(f.has_elevator),
    parking: triFrom(f.has_parking),
    balcony: triFrom(f.has_balcony),
    safeRoom: triFrom(f.has_safe_room),
    dealYear: fullYear(dealDateFrom, dealDateTo),
    dealDateFrom,
    dealDateTo,
    priceMin: text(f.price_min),
    pricePerSqmMin: text(f.price_per_sqm_min),
    pricePerSqmMax: text(f.price_per_sqm_max),
  };
}

// --------------------------------------------------------------------------
// One-line summaries shown (in teal) on a collapsed group header
// --------------------------------------------------------------------------
const range = (min: string, max: string, unit: string) => {
  const a = num(min);
  const b = num(max);
  if (a !== undefined && b !== undefined) return `${formatNumber(a)}–${formatNumber(b)} ${unit}`.trim();
  if (a !== undefined) return `מ-${formatNumber(a)} ${unit}`.trim();
  if (b !== undefined) return `עד ${formatNumber(b)} ${unit}`.trim();
  return '';
};

const prefixed = (prefix: string, text: string) => (text ? `${prefix} ${text}` : '');

const join = (parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' · ');

const roomsSummary = (s: FilterState) => {
  if (s.roomsMin && s.roomsMax && s.roomsMin === s.roomsMax) return `${s.roomsMin} חדרים`;
  if (s.roomsMin && s.roomsMax) return `${s.roomsMin}–${s.roomsMax} חדרים`;
  if (s.roomsMin) return `${s.roomsMin}+ חדרים`;
  if (s.roomsMax) return `עד ${s.roomsMax} חדרים`;
  return '';
};

export const summaries = {
  common: (s: FilterState) =>
    join([
      s.city,
      roomsSummary(s),
      s.priceMax && `עד ${formatPrice(Number(s.priceMax))}`,
    ]),

  location: (s: FilterState) =>
    join([s.neighborhood.trim() && `שכונת ${s.neighborhood.trim()}`, s.street.trim() && `רח׳ ${s.street.trim()}`]),

  property: (s: FilterState) =>
    join([
      s.propertyTypes.map((t) => PROPERTY_TYPE_HE[t]).join(', '),
      s.conditions.map((c) => CONDITION_HE[c]).join(', '),
      range(s.sizeMin, s.sizeMax, 'מ״ר'),
      prefixed('קומה', range(s.floorMin, s.floorMax, '')),
      prefixed('שנת בנייה', range(s.yearBuiltMin, s.yearBuiltMax, '')),
    ]),

  building: (s: FilterState) =>
    join(
      FEATURES.flatMap(({ key, noun }) => {
        const v = s[key];
        return v === 'yes' ? [`עם ${noun}`] : v === 'no' ? [`בלי ${noun}`] : [];
      }),
    ),

  deal: (s: FilterState) =>
    join([
      s.dealYear ? `שנת ${s.dealYear}` : dateRangeLabel(s.dealDateFrom, s.dealDateTo),
      s.priceMin && `מ-${formatPrice(Number(s.priceMin))}`,
      s.pricePerSqmMin && `מ-${formatPrice(Number(s.pricePerSqmMin))} למ״ר`,
      s.pricePerSqmMax && `עד ${formatPrice(Number(s.pricePerSqmMax))} למ״ר`,
    ]),
};
