import { ThinkingLevel } from "@google/genai";
import {
  getGemini,
  jsonError,
  REQUEST_TIMEOUT_MS,
  toErrorResponse,
  withModelFallback,
} from "@/lib/chat/gemini.server";
import {
  buildGenerateSystemPrompt,
  buildGenerateUserPrompt,
  GENERATE_SCHEMA,
  MAX_TOPIC_LENGTH,
  toGeneratedScript,
  type ScriptLength,
} from "@/lib/generate-script";

export const runtime = "nodejs";

const LENGTHS: ScriptLength[] = ["short", "medium", "long"];

/**
 * POST { topic, level, length }
 * Returns GeneratedScript: the dialogue already in script syntax, plus the learner's role name.
 */
export async function POST(req: Request) {
  const ai = getGemini();
  if (!ai) return jsonError("missing_key", 503);

  const body = await req.json().catch(() => null);
  const topic = typeof body?.topic === "string" ? body.topic.trim().slice(0, MAX_TOPIC_LENGTH) : "";
  const length: ScriptLength = LENGTHS.includes(body?.length) ? body.length : "medium";
  if (!topic || typeof body.level !== "string") return jsonError("bad_request", 400);

  try {
    const res = await withModelFallback(req.signal, (model) =>
      ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: buildGenerateUserPrompt(topic) }] }],
        config: {
          systemInstruction: buildGenerateSystemPrompt(body.level, length),
          responseMimeType: "application/json",
          responseJsonSchema: GENERATE_SCHEMA,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: req.signal,
          httpOptions: { timeout: REQUEST_TIMEOUT_MS },
        },
      }),
    );
    const script = toGeneratedScript(res.text ?? "");
    if (!script) {
      console.error("[script] generated dialogue was unusable:", res.text);
      return jsonError("upstream_error", 502);
    }
    return Response.json(script, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return toErrorResponse(err, req.signal);
  }
}
