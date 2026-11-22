import { Hono } from 'hono';
import { SearchRequestSchema } from '../../../shared/filters.js';
import type { Dataset } from './dataset.js';
import { DEFAULT_GEMINI_MODEL, GeminiError, type GeminiRuntime } from './llm/gemini.js';
import { interpretQuery } from './llm/interpret.js';
import { searchDeals } from './search.js';

/** Secrets and variables. GEMINI_API_KEY is a secret (.dev.vars locally, `wrangler secret put` in production). */
export interface Bindings {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

/** Test seams: fake fetch / sleep / clock for the LLM call. */
export interface AppOptions extends GeminiRuntime {
  now?: () => Date;
}

const apiError = (code: string, message: string, extra: Record<string, unknown> = {}) => ({
  error: { code, message, ...extra },
});

/**
 * Builds the API. The dataset is injected so tests can use small fixtures.
 * Routes: POST /api/search, GET /api/meta, GET /api/health.
 */
export function createApp(dataset: Dataset, options: AppOptions = {}) {
  const app = new Hono<{ Bindings: Bindings }>();

  app.get('/api/health', (c) => c.json({ status: 'ok', deals: dataset.entries.length }));

  app.get('/api/meta', (c) => {
    c.header('Cache-Control', 'public, max-age=300');
    return c.json(dataset.meta);
  });

  app.post('/api/search', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(apiError('invalid_json', 'Request body must be valid JSON.'), 400);
    }

    const parsed = SearchRequestSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return c.json(apiError('invalid_request', 'The search request is not valid.', { issues }), 400);
    }
    const request = parsed.data;

    // ---- manual search: no LLM involved ----------------------------------
    if (request.query === undefined) {
      return c.json(searchDeals(dataset, { ...request, filters: request.filters ?? {} }));
    }

    // ---- free-text search: Gemini turns the query into filters -----------
    // The frontend treats 503 / 502 as "free text is unavailable" and falls back to the manual filters.
    const apiKey = c.env?.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not configured.');
      return c.json(apiError('llm_unavailable', 'Free-text search is not available right now. Use "filters" instead.'), 503);
    }

    try {
      const { filters, unrecognized } = await interpretQuery(request.query, dataset.meta, {
        ...options,
        apiKey,
        model: c.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
        now: options.now?.(),
      });

      if (Object.keys(filters).length === 0) {
        return c.json(apiError('query_not_understood', 'Could not turn the query into search filters.', { unrecognized }), 422);
      }

      const result = searchDeals(dataset, { ...request, filters });
      return c.json({
        ...result,
        interpreted: true,
        warnings: [...unrecognized.map((u) => `לא הובן: ${u}`), ...result.warnings],
      });
    } catch (err) {
      if (!(err instanceof GeminiError)) throw err;
      console.error(`LLM search failed (${err.kind}): ${err.message}`);
      return err.kind === 'unavailable'
        ? c.json(apiError('llm_unavailable', 'Free-text search is not available right now. Use "filters" instead.'), 503)
        : c.json(apiError('llm_invalid_response', 'The free-text interpretation failed. Use "filters" instead.'), 502);
    }
  });

  app.notFound((c) => c.json(apiError('not_found', 'No such endpoint.'), 404));

  app.onError((err, c) => {
    console.error(err);
    return c.json(apiError('internal_error', 'Something went wrong.'), 500);
  });

  return app;
}
