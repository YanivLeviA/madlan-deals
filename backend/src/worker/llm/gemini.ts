export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** 1 first try + at most 2 retries, and only for HTTP 503. */
export const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [500, 1500];
const ATTEMPT_TIMEOUT_MS = 10_000;

/**
 * - "unavailable": we could not get an answer (not configured, 503 after all attempts, timeout,
 *   network error, rate limit, bad key...). The UI should fall back to manual filters.
 * - "invalid_response": Gemini answered, but the answer is unusable (blocked, truncated, not valid filters).
 */
export class GeminiError extends Error {
  constructor(
    readonly kind: 'unavailable' | 'invalid_response',
    message: string,
    readonly upstreamStatus?: number,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

export interface GeminiRequest {
  apiKey: string;
  model?: string;
  system: string;
  user: string;
}

export interface GeminiRuntime {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  retryDelaysMs?: number[];
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Asks Gemini for a JSON answer and returns the raw JSON text.
 * Retries ONLY on HTTP 503 (at most twice, 3 attempts in total). Every other failure is final.
 */
export async function generateJson(req: GeminiRequest, runtime: GeminiRuntime = {}): Promise<string> {
  const doFetch = runtime.fetch ?? fetch;
  const sleep = runtime.sleep ?? defaultSleep;
  const delays = runtime.retryDelaysMs ?? RETRY_DELAYS_MS;
  const url = `${ENDPOINT}/${req.model ?? DEFAULT_GEMINI_MODEL}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts: [{ text: req.user }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  });

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await doFetch(url, {
        method: 'POST',
        // The key goes in a header, never in the URL, so it cannot end up in logs.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': req.apiKey },
        body,
        signal: AbortSignal.timeout(runtime.timeoutMs ?? ATTEMPT_TIMEOUT_MS),
      });
    } catch (err) {
      // Timeout or network failure: not a 503, so no retry.
      throw new GeminiError('unavailable', `Gemini request failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (res.status === 503 && attempt < MAX_ATTEMPTS) {
      await res.body?.cancel();
      await sleep(delays[attempt - 1] ?? delays.at(-1) ?? 0);
      continue;
    }

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 500);
      throw new GeminiError('unavailable', `Gemini responded with HTTP ${res.status} (attempt ${attempt}): ${detail}`, res.status);
    }

    return extractText((await res.json()) as GenerateContentResponse);
  }
}

function extractText(data: GenerateContentResponse): string {
  const blocked = data.promptFeedback?.blockReason;
  if (blocked) throw new GeminiError('invalid_response', `Gemini blocked the prompt: ${blocked}`);

  const candidate = data.candidates?.[0];
  if (!candidate) throw new GeminiError('invalid_response', 'Gemini returned no candidates.');
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    throw new GeminiError('invalid_response', `Gemini stopped early: ${candidate.finishReason}`);
  }

  const text = (candidate.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();
  if (!text) throw new GeminiError('invalid_response', 'Gemini returned an empty answer.');
  return text;
}
