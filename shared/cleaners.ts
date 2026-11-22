import type { DatePrecision, ParseResult } from './types.js';

// --------------------------------------------------------------------------
// Text
// --------------------------------------------------------------------------

const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g; // zero-width + bidi marks
const UNUSUAL_SPACES = /[\u00A0\u2000-\u200A\u202F\u3000]/g;
const NIQQUD = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4-\u05C7]/g;

/**
 * Canonical text form used for every string field:
 * NFC, no invisible/bidi chars, no niqqud, one space between words, trimmed,
 * Hebrew gershayim/geresh and typographic quotes -> ASCII " and ', maqaf/en-dash -> "-".
 */
export function cleanText(value: string | undefined | null): string {
  return (value ?? '')
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(NIQQUD, '')
    .replace(UNUSUAL_SPACES, ' ')
    .replace(/[\u05BE\u2010-\u2015]/g, '-')
    .replace(/[\u05F4\u201C\u201D\u201E]/g, '"')
    .replace(/[\u05F3\u2018\u2019\u201A\u00B4`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lookup key for alias matching: case-insensitive, ignores spaces, hyphens, quotes and dots. */
export function lookupKey(value: string | undefined | null): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[\s\-_'".,]/g, '');
}

// --------------------------------------------------------------------------
// Numbers
// --------------------------------------------------------------------------

/**
 * Parses numbers written as: 4331000 | "4,331,000" | "₪4,331,000" | "4 חדרים"-style handled by callers |
 * "3.5" | "3,5" (decimal comma). Thousands separators are only recognised in strict 3-digit groups.
 */
export function parseNumber(raw: string | undefined | null): ParseResult<number> {
  let s = cleanText(raw)
    .replace(/₪|ש"ח|שח|nis|ils/gi, '')
    .replace(/\s+/g, '');
  if (s === '') return { kind: 'blank' };
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { kind: 'invalid' };
  const value = Number(s);
  return Number.isFinite(value) ? { kind: 'ok', value } : { kind: 'invalid' };
}

export function parseInteger(raw: string | undefined | null): ParseResult<number> {
  const r = parseNumber(raw);
  if (r.kind !== 'ok') return r;
  return Number.isInteger(r.value) ? r : { kind: 'invalid' };
}

/** "4", "3.5", "4 חדרים", "3.5 חדרים", "3,5" -> number */
export function parseRooms(raw: string | undefined | null): ParseResult<number> {
  const stripped = cleanText(raw).replace(/חדרים|חדר|rooms?/gi, '').trim();
  return parseNumber(stripped);
}

// --------------------------------------------------------------------------
// Booleans (Hebrew / English / numeric)
// --------------------------------------------------------------------------

const TRUE_TOKENS = new Set(['כן', 'yes', 'y', 'true', 't', '1', 'יש']);
const FALSE_TOKENS = new Set(['לא', 'no', 'n', 'false', 'f', '0', 'אין']);
const UNKNOWN_TOKENS = new Set(['', 'null', 'na', 'n/a', 'unknown', 'לאידוע', '-']);

export function parseBoolean(raw: string | undefined | null): ParseResult<boolean> {
  const k = cleanText(raw).toLowerCase().replace(/\s+/g, '');
  if (UNKNOWN_TOKENS.has(k)) return { kind: 'blank' };
  if (TRUE_TOKENS.has(k)) return { kind: 'ok', value: true };
  if (FALSE_TOKENS.has(k)) return { kind: 'ok', value: false };
  return { kind: 'invalid' };
}

// --------------------------------------------------------------------------
// Dates
// --------------------------------------------------------------------------

export interface ParsedDate {
  iso: string; // yyyy-mm-dd (day = 01 for month precision)
  year: number;
  month: number;
  precision: DatePrecision;
  /** Which input format matched; used only for the import report. */
  format: 'iso' | 'day_first' | 'year_month' | 'month_name';
}

const MONTHS: Record<string, number> = {
  'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3, 'apr': 4, 'april': 4,
  'may': 5, 'jun': 6, 'june': 6, 'jul': 7, 'july': 7, 'aug': 8, 'august': 8,
  'sep': 9, 'sept': 9, 'september': 9, 'oct': 10, 'october': 10, 'nov': 11, 'november': 11,
  'dec': 12, 'december': 12,
  'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6,
  'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12,
};

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function day(y: number, m: number, d: number, format: ParsedDate['format']): ParseResult<ParsedDate> {
  if (!isRealDate(y, m, d)) return { kind: 'invalid' };
  return { kind: 'ok', value: { iso: `${pad(y, 4)}-${pad(m)}-${pad(d)}`, year: y, month: m, precision: 'day', format } };
}

function month(y: number, m: number, format: ParsedDate['format']): ParseResult<ParsedDate> {
  if (m < 1 || m > 12) return { kind: 'invalid' };
  return { kind: 'ok', value: { iso: `${pad(y, 4)}-${pad(m)}-01`, year: y, month: m, precision: 'month', format } };
}

/**
 * Supported: yyyy-mm-dd | dd/mm/yyyy | dd.mm.yyyy | dd-mm-yyyy | yyyy-mm | "Aug 2025" | "אוגוסט 2025".
 * Israeli convention: slash/dot dates are DAY-first. A 2-digit year is read as 20yy.
 */
export function parseDate(raw: string | undefined | null): ParseResult<ParsedDate> {
  const s = cleanText(raw);
  if (s === '') return { kind: 'blank' };
  let m: RegExpMatchArray | null;

  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/))) return day(+m[1]!, +m[2]!, +m[3]!, 'iso');
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/))) {
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    return day(y, +m[2]!, +m[1]!, 'day_first');
  }
  if ((m = s.match(/^(\d{4})-(\d{1,2})$/))) return month(+m[1]!, +m[2]!, 'year_month');
  if ((m = s.match(/^(\d{1,2})[/.-](\d{4})$/))) return month(+m[2]!, +m[1]!, 'year_month');
  if ((m = s.match(/^([A-Za-z\u05D0-\u05EA]+)\.?,?\s+(\d{4})$/))) {
    const mo = MONTHS[m[1]!.toLowerCase()];
    return mo ? month(+m[2]!, mo, 'month_name') : { kind: 'invalid' };
  }
  return { kind: 'invalid' };
}
