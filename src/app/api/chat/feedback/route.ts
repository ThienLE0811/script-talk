import { ThinkingLevel } from "@google/genai";
import {
  buildFeedbackSystemPrompt,
  buildFeedbackUserPrompt,
  feedbackSchema,
  MAX_TEXT_LENGTH,
  parseFeedback,
  sanitizeHistory,
} from "@/lib/chat/prompts";
import {
  getGemini,
  jsonError,
  REQUEST_TIMEOUT_MS,
  toErrorResponse,
  withModelFallback,
} from "@/lib/chat/gemini.server";
import { missionFeedbackPrompt, readGoalIndexes, readMission } from "@/lib/chat/mission";

export const runtime = "nodejs";

/**
 * POST { level, history: ChatTurn[], utterance, mission?, goalsDone? }
 * Returns grammar / phrasing feedback on one learner utterance as JSON (Feedback). With a mission,
 * also reports which of the still-open goals (not in goalsDone) the utterance completed.
 */
export async function POST(req: Request) {
  const ai = getGemini();
  if (!ai) return jsonError("missing_key", 503);

  const body = await req.json().catch(() => null);
  const history = sanitizeHistory(body?.history);
  const utterance = typeof body?.utterance === "string" ? body.utterance.trim().slice(0, MAX_TEXT_LENGTH) : "";
  if (!history || !utterance || typeof body.level !== "string") return jsonError("bad_request", 400);
  const mission = readMission(body.mission);
  const missionNote = mission
    ? missionFeedbackPrompt(mission, readGoalIndexes(body.goalsDone, mission.goals.length))
    : "";

  try {
    const res = await withModelFallback(req.signal, (model) =>
      ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: buildFeedbackUserPrompt(history, utterance) }] }],
        config: {
          systemInstruction: buildFeedbackSystemPrompt(body.level) + missionNote,
          responseMimeType: "application/json",
          responseJsonSchema: feedbackSchema(Boolean(missionNote)),
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: req.signal,
          httpOptions: { timeout: REQUEST_TIMEOUT_MS },
        },
      }),
    );
    const feedback = parseFeedback(res.text ?? "");
    if (!feedback) {
      console.error("[chat] feedback was not valid JSON:", res.text);
      return jsonError("upstream_error", 502);
    }
    if (feedback.goalsDone) {
      feedback.goalsDone = mission ? readGoalIndexes(feedback.goalsDone, mission.goals.length) : undefined;
    }
    return Response.json(feedback, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return toErrorResponse(err, req.signal);
  }
}
