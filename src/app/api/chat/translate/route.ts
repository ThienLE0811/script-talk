import { ThinkingLevel } from "@google/genai";
import { TRANSLATE_SYSTEM_PROMPT } from "@/lib/chat/assist";
import {
  getGemini,
  jsonError,
  REQUEST_TIMEOUT_MS,
  toErrorResponse,
  withModelFallback,
} from "@/lib/chat/gemini.server";
import { MAX_TEXT_LENGTH } from "@/lib/chat/prompts";

export const runtime = "nodejs";

/**
 * POST { text }
 * Returns { vi }: a Vietnamese translation of one line the partner said.
 */
export async function POST(req: Request) {
  const ai = getGemini();
  if (!ai) return jsonError("missing_key", 503);

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : "";
  if (!text) return jsonError("bad_request", 400);

  try {
    const res = await withModelFallback(req.signal, (model) =>
      ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text }] }],
        config: {
          systemInstruction: TRANSLATE_SYSTEM_PROMPT,
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: req.signal,
          httpOptions: { timeout: REQUEST_TIMEOUT_MS },
        },
      }),
    );
    const vi = res.text?.trim();
    if (!vi) return jsonError("upstream_error", 502);
    return Response.json({ vi }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return toErrorResponse(err, req.signal);
  }
}
