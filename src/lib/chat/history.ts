/**
 * Pure logic for saved conversations (MongoDB collection `chats`): types, validation of what the
 * client sends, and per-session statistics. No DOM, no network.
 */
import { readGoalIndexes, readMission, type Mission } from "./mission";
import { LEVELS, MAX_CUSTOM_TOPIC_LENGTH, MAX_TEXT_LENGTH, type ChatRole, type Feedback, type LevelId } from "./prompts";
import { parseSummaryObject, type ChatSummary } from "./summary";

export type SavedTurn = { role: ChatRole; text: string; feedback?: Feedback };

export type ChatSessionStats = {
  userTurns: number;
  good: number;
  needsWork: number;
  goalCount: number;
  goalsDone: number;
};

export type ChatSession = {
  id: string;
  topicId: string;
  customTopic?: string;
  level: LevelId;
  /** Display name of the topic at the time of the session. */
  topicLabel: string;
  mission?: Mission;
  turns: SavedTurn[];
  summary?: ChatSummary;
  stats: ChatSessionStats;
  /** When the learner said something new (one timestamp per save that added turns). Drives the streak. */
  activity: number[];
  createdAt: number;
  updatedAt: number;
};

/** What the client sends when saving; the server adds stats and timestamps. */
export type ChatSessionInput = Pick<ChatSession, "topicId" | "customTopic" | "level" | "topicLabel" | "mission" | "turns" | "summary">;

/** A session in lists and on the progress page: everything but the transcript. */
export type ChatSessionMeta = Omit<ChatSession, "turns" | "summary" | "mission"> & {
  /** Recurring problems the end-of-session summary pointed out (Vietnamese). */
  focus: string[];
};

export const MAX_SAVED_TURNS = 200;
const MAX_LABEL_LENGTH = 120;

export const isChatId = (id: string) => /^[a-z0-9]{6,40}$/.test(id);

/** Mission goals the learner completed, from the feedback on their sentences. */
export function completedGoals(turns: SavedTurn[], mission: Mission | undefined | null): number[] {
  if (!mission) return [];
  return readGoalIndexes(
    turns.flatMap((t) => t.feedback?.goalsDone ?? []),
    mission.goals.length,
  );
}

export function sessionStats(turns: SavedTurn[], mission?: Mission | null): ChatSessionStats {
  const user = turns.filter((t) => t.role === "user");
  return {
    userTurns: user.length,
    good: user.filter((t) => t.feedback?.verdict === "good").length,
    needsWork: user.filter((t) => t.feedback && t.feedback.verdict !== "good").length,
    goalCount: mission?.goals.length ?? 0,
    goalsDone: completedGoals(turns, mission).length,
  };
}

function readFeedback(v: unknown): Feedback | undefined {
  if (!v || typeof v !== "object") return undefined;
  const d = v as Record<string, unknown>;
  if (d.verdict !== "good" && d.verdict !== "minor" && d.verdict !== "fix") return undefined;
  if (typeof d.corrected !== "string" || typeof d.explanation !== "string") return undefined;
  const fb: Feedback = {
    verdict: d.verdict,
    corrected: d.corrected.slice(0, MAX_TEXT_LENGTH),
    explanation: d.explanation.slice(0, MAX_TEXT_LENGTH),
  };
  if (Array.isArray(d.goalsDone)) fb.goalsDone = readGoalIndexes(d.goalsDone, 10);
  return fb;
}

/** Validate a session sent by the client. Returns null when it is not usable. */
export function readChatSessionInput(input: unknown): ChatSessionInput | null {
  if (!input || typeof input !== "object") return null;
  const d = input as Record<string, unknown>;
  if (typeof d.topicId !== "string" || !d.topicId || d.topicId.length > 40) return null;
  const level = LEVELS.find((l) => l.id === d.level)?.id;
  if (!level || !Array.isArray(d.turns)) return null;

  const turns: SavedTurn[] = [];
  for (const t of d.turns.slice(0, MAX_SAVED_TURNS)) {
    if (!t || (t.role !== "user" && t.role !== "assistant") || typeof t.text !== "string") return null;
    const text = t.text.trim().slice(0, MAX_TEXT_LENGTH);
    if (!text) continue;
    const feedback = t.role === "user" ? readFeedback(t.feedback) : undefined;
    turns.push(feedback ? { role: t.role, text, feedback } : { role: t.role, text });
  }
  if (!turns.some((t) => t.role === "user")) return null;

  const out: ChatSessionInput = {
    topicId: d.topicId,
    level,
    topicLabel: typeof d.topicLabel === "string" ? d.topicLabel.trim().slice(0, MAX_LABEL_LENGTH) : "",
    turns,
  };
  if (typeof d.customTopic === "string" && d.customTopic.trim()) {
    out.customTopic = d.customTopic.trim().slice(0, MAX_CUSTOM_TOPIC_LENGTH);
  }
  const mission = readMission(d.mission);
  if (mission) out.mission = mission;
  const summary = parseSummaryObject(d.summary);
  if (summary) out.summary = summary;
  return out;
}
