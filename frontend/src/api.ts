import type { Filters } from '../../shared/filters';
import type { SlimDeal } from '../../shared/types';

/** The part of GET /api/meta the filter panel needs. */
export interface DatasetMeta {
  cities: Array<{ name: string; count: number }>;
  property_types: Array<{ code: string; label_he: string; count: number }>;
  conditions: Array<{ code: string; label_he: string; count: number }>;
  ranges: {
    rooms: { min: number | null; max: number | null };
    price_nis: { min: number | null; max: number | null };
    deal_date: { min: string | null; max: string | null };
  };
  paging: { default_page_size: number; max_page_size: number };
}

export interface SearchResponse {
  filters: Filters;
  interpreted: boolean;
  warnings: string[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: SlimDeal[];
}

export type SearchBody = { query: string; page?: number } | { filters: Filters; page?: number };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

const ERROR_HE: Record<string, string> = {
  llm_unavailable: 'החיפוש החופשי אינו זמין כרגע. אפשר לחפש עם המסננים.',
  llm_invalid_response: 'לא הצלחנו להבין את החיפוש. נסו לנסח אחרת, או השתמשו במסננים.',
  query_not_understood: 'לא הצלחנו להפוך את הטקסט למסננים.',
  invalid_request: 'אחד המסננים אינו תקין.',
  invalid_json: 'הבקשה אינה תקינה.',
  internal_error: 'משהו השתבש. נסו שוב.',
};

export async function getMeta(): Promise<DatasetMeta> {
  let response: Response;
  try {
    response = await fetch('/api/meta');
  } catch {
    throw new ApiError('אין חיבור לשרת. בדקו שהשרת רץ.', 'network');
  }
  const data = await readJson(response);
  if (!data.ok) throw new ApiError('לא הצלחנו לטעון את אפשרויות הסינון.', 'meta');
  return data.body as DatasetMeta;
}

export async function searchDeals(body: SearchBody): Promise<SearchResponse> {
  let response: Response;
  try {
    response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('אין חיבור לשרת. בדקו שהשרת רץ.', 'network');
  }

  const data = await readJson(response);
  if (!data.ok) throw new ApiError(errorMessage(response.status, data.body), errorCode(data.body));
  return data.body as SearchResponse;
}

async function readJson(response: Response): Promise<{ ok: boolean; body: unknown }> {
  try {
    return { ok: response.ok, body: await response.json() };
  } catch {
    return { ok: false, body: null };
  }
}

function errorCode(body: unknown): string {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : 'internal_error';
}

function errorMessage(status: number, body: unknown): string {
  const code = errorCode(body);
  const message = ERROR_HE[code] ?? (status === 0 ? ERROR_HE.internal_error! : 'משהו השתבש. נסו שוב.');
  const unrecognized = (body as { error?: { unrecognized?: unknown } } | null)?.error?.unrecognized;
  if (code === 'query_not_understood' && Array.isArray(unrecognized)) {
    const words = unrecognized.filter((u): u is string => typeof u === 'string' && u.trim() !== '');
    if (words.length) return `${message} (${words.join(', ')})`;
  }
  return message;
}
