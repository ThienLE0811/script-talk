import { ThinkingLevel } from "@google/genai";
import {
  getGemini,
  jsonError,
  REQUEST_TIMEOUT_MS,
  toErrorResponse,
  withModelFallback,
} from "@/lib/chat/gemini.server";
import { MAX_CUSTOM_TOPIC_LENGTH, MAX_TEXT_LENGTH, sanitizeHistory, scenarioFor } from "@/lib/chat/prompts";
import {
  buildSummarySystemPrompt,
  buildSummaryUserPrompt,
  MAX_CORRECTIONS,
  parseSummary,
  SUMMARY_SCHEMA,
  type Correction,
} from "@/lib/chat/summary";

export const runtime = "nodejs";

function sanitizeCorrections(input: unknown): Correction[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((c) => c && typeof c.original === "string" && typeof c.corrected === "string")
    .map((c) => ({
      original: c.original.slice(0, MAX_TEXT_LENGTH),
      corrected: c.corrected.slice(0, MAX_TEXT_LENGTH),
      explanation: typeof c.explanation === "string" ? c.explanation.slice(0, MAX_TEXT_LENGTH) : "",
    }))
    .slice(-MAX_CORRECTIONS);
}

/**
 * POST { topicId, customTopic?, level, history, corrections }
 * Returns ChatSummary (Vietnamese feedback on the whole conversation) as JSON.
 */
export async function POST(req: Request) {
  const ai = getGemini();
  if (!ai) return jsonError("missing_key", 503);

  const body = await req.json().catch(() => null);
  const history = sanitizeHistory(body?.history);
  if (!history || !history.some((t) => t.role === "user") || typeof body.topicId !== "string" || typeof body.level !== "string") {
    return jsonError("bad_request", 400);
  }
  const customTopic = typeof body.customTopic === "string" ? body.customTopic.slice(0, MAX_CUSTOM_TOPIC_LENGTH) : "";

  try {
    const res = await withModelFallback(req.signal, (model) =>
      ai.models.generateContent({
        model,
        contents: [
          { role: "user", parts: [{ text: buildSummaryUserPrompt(history, sanitizeCorrections(body.corrections)) }] },
        ],
        config: {
          systemInstruction: buildSummarySystemPrompt(scenarioFor(body.topicId, customTopic), body.level),
          responseMimeType: "application/json",
          responseJsonSchema: SUMMARY_SCHEMA,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: req.signal,
          httpOptions: { timeout: REQUEST_TIMEOUT_MS },
        },
      }),
    );
    const summary = parseSummary(res.text ?? "");
    if (!summary) {
      console.error("[chat] summary was not valid JSON:", res.text);
      return jsonError("upstream_error", 502);
    }
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return toErrorResponse(err, req.signal);
  }
}
