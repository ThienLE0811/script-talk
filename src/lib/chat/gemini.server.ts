// Server-only: reads GEMINI_API_KEY. Never import this from a client component.
import { ApiError, GoogleGenAI } from "@google/genai";

/**
 * Models tried in order. The primary is a stable Flash model; when it is overloaded (503) or out of
 * quota (429 — free-tier quotas are per model), the request is retried on the lighter fallback.
 * Override with GEMINI_MODEL / GEMINI_FALLBACK_MODEL in .env.local.
 */
export const GEMINI_MODELS = [
  ...new Set([process.env.GEMINI_MODEL || "gemini-3.6-flash", process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite"]),
];

/** Per-attempt HTTP timeout, so a stuck upstream never leaves the learner waiting forever. */
export const REQUEST_TIMEOUT_MS = 20_000;

const RETRYABLE_STATUS = new Set([429, 500, 503]);

let client: GoogleGenAI | null = null;

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getGemini(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

const isTimeout = (err: unknown, signal: AbortSignal) =>
  err instanceof Error && err.name === "AbortError" && !signal.aborted;

/**
 * Run `call` with each model in GEMINI_MODELS until one succeeds. Moves on only for overload,
 * quota and timeout errors; a cancelled request (client went away) or a bad request stops at once.
 */
export async function withModelFallback<T>(signal: AbortSignal, call: (model: string) => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (const model of GEMINI_MODELS) {
    try {
      return await call(model);
    } catch (err) {
      lastErr = err;
      const retryable = (err instanceof ApiError && RETRYABLE_STATUS.has(err.status)) || isTimeout(err, signal);
      if (!retryable || signal.aborted) throw err;
      console.warn(`[chat] ${model} failed (${err instanceof ApiError ? err.status : "timeout"}), trying next model`);
    }
  }
  throw lastErr;
}

export type ChatErrorCode =
  | "missing_key"
  | "invalid_key"
  | "rate_limited"
  | "overloaded"
  | "timeout"
  | "bad_request"
  | "upstream_error";

export function jsonError(code: ChatErrorCode, status: number): Response {
  return Response.json({ error: code }, { status });
}

/** Map an SDK/API error to a stable error code for the client (details stay in the server log). */
export function toErrorResponse(err: unknown, signal: AbortSignal): Response {
  if (err instanceof ApiError) {
    console.error(`[chat] Gemini API error ${err.status}: ${err.message}`);
    // Gemini reports a bad key as 400 INVALID_ARGUMENT ("API key not valid"), not 401.
    const badKey = err.status === 400 && /api key/i.test(err.message);
    if (err.status === 401 || err.status === 403 || badKey) return jsonError("invalid_key", 401);
    if (err.status === 429) return jsonError("rate_limited", 429);
    if (err.status === 503) return jsonError("overloaded", 503);
    if (err.status === 400) return jsonError("bad_request", 400);
    return jsonError("upstream_error", 502);
  }
  if (isTimeout(err, signal)) {
    console.error("[chat] Gemini request timed out on every model");
    return jsonError("timeout", 504);
  }
  console.error("[chat] Unexpected error:", err);
  return jsonError("upstream_error", 502);
}
