export type PropertyType =
  | 'apartment'
  | 'duplex'
  | 'penthouse'
  | 'garden_apartment'
  | 'roof_apartment'
  | 'private_house'
  | 'other';

export type Condition =
  | 'new_from_developer'
  | 'renovated'
  | 'good'
  | 'well_kept'
  | 'needs_renovation';

export type DealSource = 'tax_authority' | 'broker' | 'owner';

export type DatePrecision = 'day' | 'month';

/** Non-fatal data-quality warnings attached to a kept record. */
export type QualityFlag =
  | 'unknown_city'
  | 'unknown_property_type'
  | 'unknown_condition'
  | 'unknown_source'
  | 'unexpected_id_format'
  | 'invalid_rooms'
  | 'invalid_size'
  | 'invalid_floor'
  | 'invalid_total_floors'
  | 'invalid_year_built'
  | 'invalid_boolean'
  | 'invalid_price_per_sqm'
  | 'deal_date_month_only'
  | 'size_outlier'
  | 'price_per_sqm_mismatch'
  | 'floor_exceeds_total_floors'
  | 'year_built_after_deal'
  | 'duplicate_id_conflict_resolved';

export interface CleanDeal {
  deal_id: string;
  city: string;
  neighborhood: string | null;
  street: string | null;
  property_type: PropertyType;
  property_type_he: string;
  rooms: number | null;
  size_sqm: number | null;
  floor: number | null;
  total_floors: number | null;
  year_built: number | null;
  condition: Condition | null;
  condition_he: string | null;
  has_elevator: boolean | null;
  has_parking: boolean | null;
  has_balcony: boolean | null;
  has_safe_room: boolean | null;
  /** ISO yyyy-mm-dd. When precision is "month" the day is always 01 (not a real day). */
  deal_date: string;
  deal_date_precision: DatePrecision;
  deal_year: number;
  deal_month: number;
  price_nis: number;
  /** Derived as round(price_nis / size_sqm) when both exist, otherwise the reported value. */
  price_per_sqm: number | null;
  /** Exactly what the source file reported (null if blank / 0 / unparseable). */
  price_per_sqm_reported: number | null;
  source: DealSource | null;
  source_he: string | null;
  quality_flags: QualityFlag[];
  /** 1-based CSV line numbers (header = line 1) this record was built from. */
  source_lines: number[];
}

/** The compact record the API serves (no provenance, no duplicate Hebrew labels, no raw reported value). */
export type SlimDeal = Omit<
  CleanDeal,
  'property_type_he' | 'condition_he' | 'source_he' | 'price_per_sqm_reported' | 'source_lines'
>;

export function toSlimDeal(deal: CleanDeal): SlimDeal {
  const { property_type_he, condition_he, source_he, price_per_sqm_reported, source_lines, ...slim } = deal;
  void property_type_he, condition_he, source_he, price_per_sqm_reported, source_lines;
  return slim;
}

export interface RejectedRow {
  line: number;
  deal_id: string | null;
  reasons: string[];
  raw: Record<string, string>;
}

export type ParseResult<T> =
  | { kind: 'blank' }
  | { kind: 'ok'; value: T }
  | { kind: 'invalid' };
