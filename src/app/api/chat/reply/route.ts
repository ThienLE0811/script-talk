import { ThinkingLevel } from "@google/genai";
import {
  buildReplySystemPrompt,
  MAX_CUSTOM_TOPIC_LENGTH,
  sanitizeHistory,
  scenarioFor,
  START_INSTRUCTION,
} from "@/lib/chat/prompts";
import {
  getGemini,
  jsonError,
  REQUEST_TIMEOUT_MS,
  toErrorResponse,
  withModelFallback,
} from "@/lib/chat/gemini.server";
import { CHALLENGE_PARTNER_PROMPT, readChallenge } from "@/lib/chat/challenge";
import { missionPartnerPrompt, readMission } from "@/lib/chat/mission";

export const runtime = "nodejs";

/**
 * POST { topicId, customTopic?, level, history: ChatTurn[], mission?, challenge? }
 * Streams the partner's next reply as plain UTF-8 text.
 */
export async function POST(req: Request) {
  const ai = getGemini();
  if (!ai) return jsonError("missing_key", 503);

  const body = await req.json().catch(() => null);
  const history = sanitizeHistory(body?.history);
  if (!body || !history || typeof body.topicId !== "string" || typeof body.level !== "string") {
    return jsonError("bad_request", 400);
  }
  const customTopic = typeof body.customTopic === "string" ? body.customTopic.slice(0, MAX_CUSTOM_TOPIC_LENGTH) : "";
  const mission = readMission(body.mission);
  const challenge = readChallenge(body.challenge);

  // Gemini needs the first turn to be from the user; the start instruction lets the model open the conversation.
  const contents = [
    { role: "user", parts: [{ text: START_INSTRUCTION }] },
    ...history.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
  ];

  try {
    // Errors (overload, quota, bad key) surface here, before streaming starts, so fallback is safe.
    const stream = await withModelFallback(req.signal, (model) =>
      ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction:
            buildReplySystemPrompt(scenarioFor(body.topicId, customTopic), body.level) +
            (mission ? missionPartnerPrompt(mission) : "") +
            (challenge ? CHALLENGE_PARTNER_PROMPT : ""),
          // Thinking tokens count toward this cap, so leave headroom above the ~40-word reply.
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: req.signal,
          httpOptions: { timeout: REQUEST_TIMEOUT_MS },
        },
      }),
    );

    const encoder = new TextEncoder();
    const out = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.text;
            if (text) controller.enqueue(encoder.encode(text));
          }
          controller.close();
        } catch (err) {
          console.error("[chat] reply stream failed:", err);
          controller.error(err);
        }
      },
    });
    return new Response(out, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return toErrorResponse(err, req.signal);
  }
}
