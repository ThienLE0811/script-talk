import { ThinkingLevel } from "@google/genai";
import { buildSuggestSystemPrompt, buildSuggestUserPrompt, parseSuggestions, SUGGEST_SCHEMA } from "@/lib/chat/assist";
import {
  getGemini,
  jsonError,
  REQUEST_TIMEOUT_MS,
  toErrorResponse,
  withModelFallback,
} from "@/lib/chat/gemini.server";
import { readChallenge } from "@/lib/chat/challenge";
import { readMission } from "@/lib/chat/mission";
import { MAX_CUSTOM_TOPIC_LENGTH, sanitizeHistory, scenarioFor } from "@/lib/chat/prompts";

export const runtime = "nodejs";

/**
 * POST { topicId, customTopic?, level, history, mission?, challenge? }
 * Returns { suggestions: ReplySuggestion[] }: things the learner could say next, with Vietnamese meanings.
 */
export async function POST(req: Request) {
  const ai = getGemini();
  if (!ai) return jsonError("missing_key", 503);

  const body = await req.json().catch(() => null);
  const history = sanitizeHistory(body?.history);
  if (!history?.length || typeof body.topicId !== "string" || typeof body.level !== "string") {
    return jsonError("bad_request", 400);
  }
  const customTopic = typeof body.customTopic === "string" ? body.customTopic.slice(0, MAX_CUSTOM_TOPIC_LENGTH) : "";
  const mission = readMission(body.mission);

  try {
    const res = await withModelFallback(req.signal, (model) =>
      ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: buildSuggestUserPrompt(history) }] }],
        config: {
          systemInstruction: buildSuggestSystemPrompt(
            scenarioFor(body.topicId, customTopic),
            body.level,
            mission,
            readChallenge(body.challenge),
          ),
          responseMimeType: "application/json",
          responseJsonSchema: SUGGEST_SCHEMA,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: req.signal,
          httpOptions: { timeout: REQUEST_TIMEOUT_MS },
        },
      }),
    );
    const suggestions = parseSuggestions(res.text ?? "");
    if (!suggestions) {
      console.error("[chat] suggestions were not valid JSON:", res.text);
      return jsonError("upstream_error", 502);
    }
    return Response.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return toErrorResponse(err, req.signal);
  }
}
