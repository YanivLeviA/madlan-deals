import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import {
  cleanText,
  parseBoolean,
  parseDate,
  parseInteger,
  parseNumber,
  parseRooms,
} from '../../../shared/cleaners.js';
import { decodeCsvBuffer } from './encoding.js';
import {
  CONDITION_HE,
  PROPERTY_TYPE_HE,
  SOURCE_HE,
  SOURCE_PRIORITY,
  canonicalCity,
  canonicalNeighborhood,
  conditionLookup,
  propertyTypeLookup,
  sourceLookup,
} from '../../../shared/aliases.js';
import { toSlimDeal } from '../../../shared/types.js';
import type { CleanDeal, Condition, QualityFlag, RejectedRow } from '../../../shared/types.js';

// --------------------------------------------------------------------------
// Configuration (all thresholds are assumptions; see ASSUMPTIONS below)
// --------------------------------------------------------------------------
export const REQUIRED_COLUMNS = [
  'deal_id', 'city', 'neighborhood', 'street', 'property_type', 'rooms', 'size_sqm', 'floor',
  'total_floors', 'year_built', 'condition', 'has_elevator', 'has_parking', 'has_balcony',
  'has_safe_room', 'deal_date', 'price_nis', 'price_per_sqm', 'source',
] as const;

const LIMITS = {
  minPriceNis: 100_000,
  rooms: [1, 20],
  size: [10, 1000],
  sizeOutlier: [20, 300],
  floor: [-5, 120],
  totalFloors: [1, 120],
  minYearBuilt: 1800,
  maxYearBuiltAheadOfNow: 5,
  minDealYear: 1990,
  pricePerSqmTolerance: 0.02,
} as const;

export const ASSUMPTIONS: string[] = [
  'The original CSV is never modified; its SHA-256 is recorded in the report. Output goes to Data/processed/.',
  'Encoding is auto-detected: BOM (UTF-8/UTF-16) -> strict UTF-8 -> BOM-less UTF-16 -> windows-1255 (accepted only if the result looks like Hebrew). If none fits, the import fails instead of guessing. The detected encoding is stored in the report.',
  'The header is matched by column NAME (order does not matter). A missing required column aborts the import.',
  'A row whose field count differs from the header is rejected (never guessed/repaired).',
  'Rows are REJECTED (written to deals.rejected.json, not to the clean dataset) when: deal_id is missing, city is missing, deal_date is missing/unparseable/in the future/before 1990, or price_nis is missing/unparseable/below 100,000 NIS.',
  'Slash/dot dates (15/06/2025, 17.07.2026) are DAY-first (Israeli convention). In the sample no value has a month > 12 in the 2nd position while 75 have a day > 12 in the 1st, which supports this.',
  'Month-only dates ("Aug 2025") are kept as 2025-08-01 with deal_date_precision="month" (+ flag deal_date_month_only). deal_year / deal_month are always exact; do not treat the "01" as a real day.',
  'Prices are whole NIS. "₪", spaces and thousands commas are stripped. A price of 0 or 18,000 is treated as invalid data, not a real sale.',
  'City aliases map to one canonical Hebrew name. "ת"א" and "תל אביב" -> תל אביב-יפו; "ב"ש" -> באר שבע (NOT בית שמש); "מודיעין" -> מודיעין-מכבים-רעות. Unknown cities are kept as-is and flagged unknown_city.',
  'Neighborhoods are only trimmed/normalized; "מרכז" and "מרכז העיר" are NOT merged (they may or may not be the same area). Two safe aliases are applied: English "Florentin", and the abbreviation רמב"ש = רמת בית שמש. A trailing Hebrew letter without geresh ("רמת בית שמש א") gets one ("א\'").',
  'Blank means "unknown" -> null. In particular a blank has_parking is null, NOT false.',
  'Booleans: כן/yes/true/1 -> true; לא/no/false/0 -> false; anything else -> null + flag invalid_boolean.',
  'rooms: "4 חדרים" -> 4. Half rooms are kept. Valid range 1-20, otherwise null + flag.',
  'size_sqm valid range 10-1000 sqm (else null + flag). Sizes outside 20-300 are kept but flagged size_outlier. size_sqm is assumed to be one consistent measure (we do not know if it is built/registered/net).',
  'floor 0 = ground floor. A blank floor stays null (24 rows, mostly regular apartments). floor > total_floors is flagged, not fixed.',
  'year_built blank -> null. year_built later than the deal year is KEPT and flagged year_built_after_deal (could be a pre-sale from a developer, but is contradictory when condition is "דורש שיפוץ").',
  'price_per_sqm is DERIVED as round(price_nis / size_sqm) when both exist. The file\'s own value is kept as price_per_sqm_reported (0 -> null). If they differ by more than 2% the record is kept and flagged price_per_sqm_mismatch; we do NOT know whether price, size or the reported value is the wrong one.',
  'Duplicate deal_id: identical rows are collapsed. If rows conflict, we keep (1) the one whose price matches its own price_per_sqm, then (2) the most trusted source (tax authority > owner > broker), then (3) the first line. Every conflict is listed in the report.',
  'Enumerations get an English code (for filters / LLM schema) next to the original Hebrew label (property_type_he, condition_he, source_he). "שמור" (well_kept) and "במצב טוב" (good) are kept as separate conditions.',
  'Text: NFC, invisible/bidi characters and niqqud removed, whitespace collapsed, gershayim/geresh normalised to ASCII " and \'.',
];

// --------------------------------------------------------------------------
// Audit trail: every normalization / drop is counted with a few examples
// --------------------------------------------------------------------------
interface AuditEntry {
  count: number;
  examples: Array<{ line: number; before: string; after: string }>;
}

class Audit {
  readonly entries = new Map<string, AuditEntry>();

  note(field: string, kind: string, line: number, before: string, after: unknown): void {
    const key = `${field}:${kind}`;
    const e = this.entries.get(key) ?? { count: 0, examples: [] };
    e.count++;
    if (e.examples.length < 3) e.examples.push({ line, before, after: String(after) });
    this.entries.set(key, e);
  }

  toJSON(): Record<string, AuditEntry> {
    return Object.fromEntries([...this.entries].sort(([a], [b]) => a.localeCompare(b)));
  }
}

// --------------------------------------------------------------------------
// Row cleaning
// --------------------------------------------------------------------------
interface CleanedRow {
  deal?: CleanDeal;
  reject?: RejectedRow;
}

const inRange = (v: number, [min, max]: readonly [number, number] | readonly number[]) =>
  v >= (min as number) && v <= (max as number);

function cleanRow(raw: Record<string, string>, line: number, audit: Audit, now: Date): CleanedRow {
  const reasons: string[] = [];
  const flags = new Set<QualityFlag>();

  // Records trivial whitespace/format normalization for text fields.
  const text = (field: string, value: string | undefined): string => {
    const cleaned = cleanText(value);
    if (value !== undefined && cleaned !== value && cleaned !== '') audit.note(field, 'text_normalized', line, value, cleaned);
    return cleaned;
  };

  // ---- identity -----------------------------------------------------------
  const deal_id = text('deal_id', raw.deal_id).toUpperCase();
  if (!deal_id) reasons.push('missing_deal_id');
  else if (!/^D\d+$/.test(deal_id)) flags.add('unexpected_id_format');

  // ---- location -----------------------------------------------------------
  const cityText = text('city', raw.city);
  let city = cityText;
  if (!cityText) reasons.push('missing_city');
  else {
    const canon = canonicalCity(cityText);
    if (!canon) flags.add('unknown_city');
    else if (canon !== cityText) {
      audit.note('city', 'alias_mapped', line, cityText, canon);
      city = canon;
    }
  }

  let neighborhood: string | null = text('neighborhood', raw.neighborhood) || null;
  if (neighborhood === null) audit.note('neighborhood', 'blank_to_null', line, raw.neighborhood ?? '', 'null');
  else {
    let n = neighborhood.replace(/^(.+ )([\u05D0-\u05D8])$/, "$1$2'"); // "רמת בית שמש א" -> "...א'"
    n = canonicalNeighborhood(n) ?? n;
    if (n !== neighborhood) audit.note('neighborhood', 'alias_mapped', line, neighborhood, n);
    neighborhood = n;
  }

  const street = text('street', raw.street) || null;
  if (street === null) audit.note('street', 'blank_to_null', line, raw.street ?? '', 'null');

  // ---- property -----------------------------------------------------------
  const typeText = text('property_type', raw.property_type);
  let property_type = propertyTypeLookup(typeText);
  if (!property_type) {
    flags.add('unknown_property_type');
    property_type = 'other';
  }
  const property_type_he = property_type === 'other' ? typeText : PROPERTY_TYPE_HE[property_type];

  const optionalNumber = (
    field: string,
    parser: (s: string | undefined) => ReturnType<typeof parseNumber>,
    valid: (v: number) => boolean,
    flag: QualityFlag,
  ): number | null => {
    const r = parser(raw[field]);
    if (r.kind === 'blank') {
      audit.note(field, 'blank_to_null', line, raw[field] ?? '', 'null');
      return null;
    }
    if (r.kind === 'ok' && valid(r.value)) {
      const rawText = raw[field] ?? '';
      if (String(r.value) !== rawText.trim()) audit.note(field, 'number_normalized', line, rawText, r.value);
      return r.value;
    }
    flags.add(flag);
    audit.note(field, 'invalid_to_null', line, raw[field] ?? '', 'null');
    return null;
  };

  const rooms = optionalNumber('rooms', parseRooms, (v) => inRange(v, LIMITS.rooms), 'invalid_rooms');
  const size_sqm = optionalNumber('size_sqm', parseNumber, (v) => inRange(v, LIMITS.size), 'invalid_size');
  const floor = optionalNumber('floor', parseInteger, (v) => inRange(v, LIMITS.floor), 'invalid_floor');
  const total_floors = optionalNumber('total_floors', parseInteger, (v) => inRange(v, LIMITS.totalFloors), 'invalid_total_floors');
  const maxYear = now.getUTCFullYear() + LIMITS.maxYearBuiltAheadOfNow;
  const year_built = optionalNumber('year_built', parseInteger, (v) => v >= LIMITS.minYearBuilt && v <= maxYear, 'invalid_year_built');

  if (size_sqm !== null && !inRange(size_sqm, LIMITS.sizeOutlier)) flags.add('size_outlier');
  if (floor !== null && total_floors !== null && floor > total_floors) flags.add('floor_exceeds_total_floors');

  const conditionText = text('condition', raw.condition);
  let condition: Condition | null = null;
  let condition_he: string | null = null;
  if (conditionText === '') audit.note('condition', 'blank_to_null', line, raw.condition ?? '', 'null');
  else {
    condition = conditionLookup(conditionText) ?? null;
    if (condition) condition_he = CONDITION_HE[condition];
    else flags.add('unknown_condition');
  }

  const bool = (field: string): boolean | null => {
    const r = parseBoolean(raw[field]);
    if (r.kind === 'ok') {
      const rawText = raw[field] ?? '';
      if (rawText !== String(r.value) ) audit.note(field, 'boolean_normalized', line, rawText, r.value);
      return r.value;
    }
    if (r.kind === 'blank') audit.note(field, 'blank_to_null', line, raw[field] ?? '', 'null');
    else {
      flags.add('invalid_boolean');
      audit.note(field, 'invalid_to_null', line, raw[field] ?? '', 'null');
    }
    return null;
  };
  const has_elevator = bool('has_elevator');
  const has_parking = bool('has_parking');
  const has_balcony = bool('has_balcony');
  const has_safe_room = bool('has_safe_room');

  // ---- date ---------------------------------------------------------------
  const dateRaw = raw.deal_date ?? '';
  const date = parseDate(dateRaw);
  let dealDate: Extract<typeof date, { kind: 'ok' }>['value'] | null = null;
  if (date.kind === 'blank') reasons.push('missing_deal_date');
  else if (date.kind === 'invalid') reasons.push('invalid_deal_date');
  else if (date.value.year < LIMITS.minDealYear) reasons.push('deal_date_too_old');
  else if (new Date(`${date.value.iso}T00:00:00Z`) > now) reasons.push('deal_date_in_future');
  else {
    dealDate = date.value;
    if (dateRaw.trim() !== date.value.iso) audit.note('deal_date', `format_${date.value.format}`, line, dateRaw, date.value.iso);
    if (date.value.precision === 'month') flags.add('deal_date_month_only');
  }

  // ---- price --------------------------------------------------------------
  const priceR = parseNumber(raw.price_nis);
  let price_nis: number | null = null;
  if (priceR.kind === 'blank') reasons.push('missing_price');
  else if (priceR.kind === 'invalid') reasons.push('invalid_price');
  else if (priceR.value < LIMITS.minPriceNis) reasons.push('implausible_price');
  else {
    price_nis = Math.round(priceR.value);
    if (String(price_nis) !== (raw.price_nis ?? '').trim()) audit.note('price_nis', 'number_normalized', line, raw.price_nis ?? '', price_nis);
  }

  const ppsR = parseNumber(raw.price_per_sqm);
  let price_per_sqm_reported: number | null = null;
  if (ppsR.kind === 'blank') audit.note('price_per_sqm', 'blank_to_null', line, raw.price_per_sqm ?? '', 'null');
  else if (ppsR.kind === 'ok' && ppsR.value > 0) price_per_sqm_reported = Math.round(ppsR.value);
  else {
    flags.add('invalid_price_per_sqm');
    audit.note('price_per_sqm', 'invalid_or_zero_to_null', line, raw.price_per_sqm ?? '', 'null');
  }

  let price_per_sqm = price_per_sqm_reported;
  if (price_nis !== null && size_sqm !== null) {
    price_per_sqm = Math.round(price_nis / size_sqm);
    if (
      price_per_sqm_reported !== null &&
      Math.abs(price_per_sqm - price_per_sqm_reported) / price_per_sqm_reported > LIMITS.pricePerSqmTolerance
    ) {
      flags.add('price_per_sqm_mismatch');
    }
  }

  if (dealDate && year_built !== null && year_built > dealDate.year) flags.add('year_built_after_deal');

  // ---- source -------------------------------------------------------------
  const sourceText = text('source', raw.source);
  const source = sourceText ? sourceLookup(sourceText) ?? null : null;
  if (sourceText && !source) flags.add('unknown_source');

  if (reasons.length > 0 || !dealDate || price_nis === null) {
    return { reject: { line, deal_id: deal_id || null, reasons, raw } };
  }

  return {
    deal: {
      deal_id,
      city,
      neighborhood,
      street,
      property_type,
      property_type_he,
      rooms,
      size_sqm,
      floor,
      total_floors,
      year_built,
      condition,
      condition_he,
      has_elevator,
      has_parking,
      has_balcony,
      has_safe_room,
      deal_date: dealDate.iso,
      deal_date_precision: dealDate.precision,
      deal_year: dealDate.year,
      deal_month: dealDate.month,
      price_nis,
      price_per_sqm,
      price_per_sqm_reported,
      source,
      source_he: source ? SOURCE_HE[source] : null,
      quality_flags: [...flags].sort(),
      source_lines: [line],
    },
  };
}

// --------------------------------------------------------------------------
// Duplicate handling
// --------------------------------------------------------------------------
const signature = (d: CleanDeal) => JSON.stringify({ ...d, source_lines: undefined });
const priceMatchesOwnPps = (d: CleanDeal) => !d.quality_flags.includes('price_per_sqm_mismatch');

function pickWinner(group: CleanDeal[]): { winner: CleanDeal; reason: string } {
  const ranked = [...group].sort((a, b) => {
    const consistency = Number(priceMatchesOwnPps(b)) - Number(priceMatchesOwnPps(a));
    if (consistency !== 0) return consistency;
    const sa = a.source ? SOURCE_PRIORITY[a.source] : 0;
    const sb = b.source ? SOURCE_PRIORITY[b.source] : 0;
    if (sa !== sb) return sb - sa;
    return a.source_lines[0]! - b.source_lines[0]!;
  });
  const [first, second] = ranked as [CleanDeal, CleanDeal];
  let reason = 'first_line';
  if (priceMatchesOwnPps(first) !== priceMatchesOwnPps(second)) reason = 'price_consistent_with_price_per_sqm';
  else if ((first.source ? SOURCE_PRIORITY[first.source] : 0) !== (second.source ? SOURCE_PRIORITY[second.source] : 0)) reason = 'higher_trust_source';
  return { winner: first, reason };
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
export interface ImportOptions {
  inputPath: string;
  outDir: string;
  /** When set, a slim, compact copy of the clean deals is also written here (bundled into the Worker). */
  workerDataPath?: string;
  now?: Date;
}

export interface ImportResult {
  deals: CleanDeal[];
  rejected: RejectedRow[];
  report: Record<string, unknown>;
  outputs: { clean: string; rejected: string; report: string; worker?: string };
}

export async function importDeals(opts: ImportOptions): Promise<ImportResult> {
  const now = opts.now ?? new Date();
  const buffer = await readFile(opts.inputPath);
  const sha256 = createHash('sha256').update(buffer).digest('hex');

  const { text: content, encoding, detection } = decodeCsvBuffer(buffer);

  const records: Array<{ record: string[]; line: number }> = (
    parse(content, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true, // we validate column counts ourselves so bad rows are reported, not fatal
      info: true,
    }) as unknown as Array<{ record: string[]; info: { lines: number } }>
  ).map(({ record, info }) => ({ record, line: info.lines }));

  const headerEntry = records.shift();
  if (!headerEntry) throw new Error('CSV is empty.');
  const header = headerEntry.record.map((h) => cleanText(h).toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`CSV is missing required columns: ${missing.join(', ')}`);
  const unexpectedColumns = header.filter((h) => !(REQUIRED_COLUMNS as readonly string[]).includes(h));

  const audit = new Audit();
  const rejected: RejectedRow[] = [];
  const cleaned: CleanDeal[] = [];

  for (const { record, line } of records) {
    const rawRow = Object.fromEntries(header.map((h, i) => [h, record[i] ?? ''])) as Record<string, string>;
    if (record.length !== header.length) {
      rejected.push({ line, deal_id: cleanText(record[0]) || null, reasons: [`column_count_${record.length}_expected_${header.length}`], raw: rawRow });
      continue;
    }
    const result = cleanRow(rawRow, line, audit, now);
    if (result.deal) cleaned.push(result.deal);
    else if (result.reject) rejected.push(result.reject);
  }

  // ---- de-duplicate by deal_id -------------------------------------------
  const groups = new Map<string, CleanDeal[]>();
  for (const d of cleaned) groups.set(d.deal_id, [...(groups.get(d.deal_id) ?? []), d]);

  const deals: CleanDeal[] = [];
  const exactDuplicates: Array<{ deal_id: string; lines: number[] }> = [];
  const conflicts: Array<Record<string, unknown>> = [];

  for (const [deal_id, group] of groups) {
    if (group.length === 1) {
      deals.push(group[0]!);
      continue;
    }
    const lines = group.flatMap((g) => g.source_lines).sort((a, b) => a - b);
    if (new Set(group.map(signature)).size === 1) {
      exactDuplicates.push({ deal_id, lines });
      deals.push({ ...group[0]!, source_lines: lines });
      continue;
    }
    const { winner, reason } = pickWinner(group);
    const fieldsDiffering = Object.keys(winner).filter(
      (k) => k !== 'source_lines' && k !== 'quality_flags' && new Set(group.map((g) => JSON.stringify((g as unknown as Record<string, unknown>)[k]))).size > 1,
    );
    conflicts.push({
      deal_id,
      kept_line: winner.source_lines[0],
      reason,
      fields_differing: fieldsDiffering,
      candidates: group.map((g) => ({
        line: g.source_lines[0],
        source: g.source,
        price_nis: g.price_nis,
        price_per_sqm_reported: g.price_per_sqm_reported,
        price_per_sqm_consistent: priceMatchesOwnPps(g),
      })),
    });
    deals.push({
      ...winner,
      quality_flags: [...new Set([...winner.quality_flags, 'duplicate_id_conflict_resolved' as const])].sort(),
      source_lines: lines,
    });
  }
  deals.sort((a, b) => a.deal_id.localeCompare(b.deal_id));

  // ---- report -------------------------------------------------------------
  const nullCounts: Record<string, number> = {};
  const flagCounts: Record<string, number> = {};
  for (const d of deals) {
    for (const [k, v] of Object.entries(d)) if (v === null) nullCounts[k] = (nullCounts[k] ?? 0) + 1;
    for (const f of d.quality_flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
  }
  const countBy = (pick: (d: CleanDeal) => string) => {
    const m: Record<string, number> = {};
    for (const d of deals) m[pick(d)] = (m[pick(d)] ?? 0) + 1;
    return Object.fromEntries(Object.entries(m).sort(([, a], [, b]) => b - a));
  };
  const rejectedByReason: Record<string, number> = {};
  for (const r of rejected) for (const reason of r.reasons) rejectedByReason[reason] = (rejectedByReason[reason] ?? 0) + 1;

  const report = {
    generated_at: now.toISOString(),
    input: { path: opts.inputPath, sha256, bytes: buffer.length, encoding, encoding_detection: detection, columns: header, unexpected_columns: unexpectedColumns },
    counts: {
      csv_data_rows: records.length,
      rejected_rows: rejected.length,
      parsed_ok_before_dedup: cleaned.length,
      exact_duplicate_rows_removed: exactDuplicates.reduce((n, d) => n + d.lines.length - 1, 0),
      conflicting_duplicate_ids_resolved: conflicts.length,
      conflicting_duplicate_rows_dropped: conflicts.reduce((n, c) => n + (c.candidates as unknown[]).length - 1, 0),
      final_clean_records: deals.length,
      final_records_with_at_least_one_flag: deals.filter((d) => d.quality_flags.length > 0).length,
    },
    rejected_by_reason: rejectedByReason,
    quality_flag_counts: flagCounts,
    null_counts_in_clean_data: nullCounts,
    distributions: {
      city: countBy((d) => d.city),
      property_type: countBy((d) => d.property_type),
      source: countBy((d) => d.source ?? 'null'),
      deal_year: countBy((d) => String(d.deal_year)),
      deal_date_precision: countBy((d) => d.deal_date_precision),
    },
    exact_duplicates: exactDuplicates,
    conflicting_duplicates: conflicts,
    normalizations: audit.toJSON(),
    assumptions: ASSUMPTIONS,
  };

  // ---- write --------------------------------------------------------------
  await mkdir(opts.outDir, { recursive: true });
  const outputs: ImportResult['outputs'] = {
    clean: path.join(opts.outDir, 'deals.clean.json'),
    rejected: path.join(opts.outDir, 'deals.rejected.json'),
    report: path.join(opts.outDir, 'import-report.json'),
  };
  const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
  await writeFile(outputs.clean, json(deals), 'utf8');
  await writeFile(outputs.rejected, json(rejected), 'utf8');
  await writeFile(outputs.report, json(report), 'utf8');
  if (opts.workerDataPath) {
    await mkdir(path.dirname(opts.workerDataPath), { recursive: true });
    await writeFile(opts.workerDataPath, JSON.stringify(deals.map(toSlimDeal)) + '\n', 'utf8'); // compact: it ships in the bundle
    outputs.worker = opts.workerDataPath;
  }

  // Prove the original was left untouched.
  const after = createHash('sha256').update(await readFile(opts.inputPath)).digest('hex');
  if (after !== sha256) throw new Error('Original CSV changed during import (this should never happen).');

  return { deals, rejected, report, outputs };
}
