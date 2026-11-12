import { ThinkingLevel } from "@google/genai";
import {
  getGemini,
  jsonError,
  REQUEST_TIMEOUT_MS,
  toErrorResponse,
  withModelFallback,
} from "@/lib/chat/gemini.server";
import { buildMissionSystemPrompt, MISSION_SCHEMA, parseMission } from "@/lib/chat/mission";
import { MAX_CUSTOM_TOPIC_LENGTH, scenarioFor } from "@/lib/chat/prompts";

export const runtime = "nodejs";

/**
 * POST { topicId, customTopic?, level }
 * Returns a Mission (Vietnamese brief + concrete goals) for the role-play.
 */
export async function POST(req: Request) {
  const ai = getGemini();
  if (!ai) return jsonError("missing_key", 503);

  const body = await req.json().catch(() => null);
  if (!body || typeof body.topicId !== "string" || typeof body.level !== "string") return jsonError("bad_request", 400);
  const customTopic = typeof body.customTopic === "string" ? body.customTopic.slice(0, MAX_CUSTOM_TOPIC_LENGTH) : "";

  try {
    const res = await withModelFallback(req.signal, (model) =>
      ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: "Create the mission now." }] }],
        config: {
          systemInstruction: buildMissionSystemPrompt(scenarioFor(body.topicId, customTopic), body.level),
          responseMimeType: "application/json",
          responseJsonSchema: MISSION_SCHEMA,
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: req.signal,
          httpOptions: { timeout: REQUEST_TIMEOUT_MS },
        },
      }),
    );
    const mission = parseMission(res.text ?? "");
    if (!mission) {
      console.error("[chat] mission was not valid JSON:", res.text);
      return jsonError("upstream_error", 502);
    }
    return Response.json(mission, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return toErrorResponse(err, req.signal);
  }
}
