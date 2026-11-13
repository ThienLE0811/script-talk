/**
 * Pure logic for saved conversations (MongoDB collection `chats`): types, validation of what the
 * client sends, and per-session statistics. No DOM, no network.
 */
import { readGoalIndexes, readMission, type Mission } from "./mission";
import { LEVELS, MAX_CUSTOM_TOPIC_LENGTH, MAX_TEXT_LENGTH, type ChatRole, type Feedback, type LevelId } from "./prompts";
import { parseSummaryObject, type ChatSummary } from "./summary";

export type SavedTurn = {
  role: ChatRole;
  text: string;
  feedback?: Feedback;
  /**
   * Learner turns only: ms from the mic opening (right after the AI finished speaking) to the learner
   * starting to speak. Missing when the answer was typed, or the turn was interrupted (pause, replay,
   * suggestions…), so it only measures a spontaneous spoken reply.
   */
  responseMs?: number;
};

export type ChatSessionStats = {
  userTurns: number;
  good: number;
  needsWork: number;
  goalCount: number;
  goalsDone: number;
  /** Words in all learner turns (sessions saved before fluency stats lack it). */
  words?: number;
  /** Median response time of the timed learner turns, in ms. */
  responseMs?: number;
  /** Learner turns with a response time. */
  timedTurns?: number;
};

/** Longest response time kept: beyond this the mic has given up anyway (startListening maxMs). */
export const MAX_RESPONSE_MS = 30_000;

/** Words in a sentence (tokens with a letter or digit, so punctuation alone does not count). */
export const countWords = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

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
  const times = user.flatMap((t) => (t.responseMs === undefined ? [] : [t.responseMs]));
  const responseMs = median(times);
  return {
    userTurns: user.length,
    good: user.filter((t) => t.feedback?.verdict === "good").length,
    needsWork: user.filter((t) => t.feedback && t.feedback.verdict !== "good").length,
    goalCount: mission?.goals.length ?? 0,
    goalsDone: completedGoals(turns, mission).length,
    words: user.reduce((n, t) => n + countWords(t.text), 0),
    timedTurns: times.length,
    ...(responseMs === undefined ? {} : { responseMs }),
  };
}

/** Words per learner turn, or null when unknown (old session) or nothing was said. */
export const wordsPerTurn = (s: Pick<ChatSessionStats, "words" | "userTurns">): number | null =>
  s.words !== undefined && s.userTurns > 0 ? s.words / s.userTurns : null;

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

/** One turn sent by the client: null when malformed (reject the session), undefined when empty (skip it). */
function readTurn(t: unknown): SavedTurn | null | undefined {
  if (!t || typeof t !== "object") return null;
  const d = t as Record<string, unknown>;
  if ((d.role !== "user" && d.role !== "assistant") || typeof d.text !== "string") return null;
  const text = d.text.trim().slice(0, MAX_TEXT_LENGTH);
  if (!text) return undefined;
  const turn: SavedTurn = { role: d.role, text };
  if (d.role !== "user") return turn;
  const feedback = readFeedback(d.feedback);
  if (feedback) turn.feedback = feedback;
  const ms = d.responseMs;
  if (typeof ms === "number" && Number.isFinite(ms) && ms >= 0 && ms <= MAX_RESPONSE_MS) turn.responseMs = Math.round(ms);
  return turn;
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
    const turn = readTurn(t);
    if (turn === null) return null;
    if (turn) turns.push(turn);
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
