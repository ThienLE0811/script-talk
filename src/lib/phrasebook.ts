/**
 * Pure logic for the phrasebook ("Sổ tay câu"): spaced-repetition schedule and de-duplication.
 * No DOM, no network, no database.
 */
import { cleanForSpeech, normalizeSentence } from "./script";

export type PhraseSource = "chat" | "script" | "manual";

export type Phrase = {
  id: string;
  /** The correct English sentence to practise. */
  text: string;
  /** What the learner actually said, when the phrase came from a correction. */
  original?: string;
  /** Short explanation (Vietnamese) or a meaning. */
  note?: string;
  source: PhraseSource;
  /** Where it came from: chat topic or script title. */
  context?: string;
  createdAt: number;
  /** Leitner box: 0 = new or just failed, higher = known better. */
  box: number;
  /** When it is next due for review (ms since epoch). */
  dueAt: number;
  reviews: number;
  lastScore?: number;
  lastReviewedAt?: number;
};

export type NewPhrase = Pick<Phrase, "text" | "original" | "note" | "source" | "context">;

/** Days until the next review after passing from box N (index = box after promotion - 1). */
export const REVIEW_INTERVAL_DAYS = [1, 2, 4, 8, 16, 32];
export const MAX_BOX = REVIEW_INTERVAL_DAYS.length;
/** From this box on, a phrase counts as "đã thuộc". */
export const MASTERED_BOX = 4;
export const REVIEW_PASS_SCORE = 80;
export const MAX_REVIEW_BATCH = 20;
export const MAX_PHRASE_LENGTH = 400;
export const MAX_NOTE_LENGTH = 600;

const DAY = 24 * 60 * 60 * 1000;

/** Normalised form used to spot the same sentence written differently ("I'm" vs "i am", punctuation). */
export function phraseKey(text: string): string {
  return normalizeSentence(text).join(" ");
}

/** Clean user/AI text into a single practisable line (stage notes and line breaks removed). */
export function cleanPhraseText(text: string): string {
  return cleanForSpeech(text).replace(/\s+/g, " ").trim().slice(0, MAX_PHRASE_LENGTH);
}

/** Schedule after one review: pass moves up a box and waits longer, fail goes back to box 0 (due now). */
export function scheduleAfterReview(box: number, passed: boolean, now = Date.now()): { box: number; dueAt: number } {
  if (!passed) return { box: 0, dueAt: now };
  const next = Math.min(Math.max(box, 0) + 1, MAX_BOX);
  return { box: next, dueAt: now + REVIEW_INTERVAL_DAYS[next - 1] * DAY };
}

export const isDue = (p: Phrase, now = Date.now()) => p.dueAt <= now;
export const isMastered = (p: Phrase) => p.box >= MASTERED_BOX;

/** Phrases to review now, most overdue first, at most MAX_REVIEW_BATCH. */
export function reviewQueue(phrases: Phrase[], now = Date.now()): Phrase[] {
  return phrases
    .filter((p) => isDue(p, now))
    .sort((a, b) => a.dueAt - b.dueAt || a.createdAt - b.createdAt)
    .slice(0, MAX_REVIEW_BATCH);
}

export function phraseStats(phrases: Phrase[], now = Date.now()) {
  return {
    total: phrases.length,
    due: phrases.filter((p) => isDue(p, now)).length,
    mastered: phrases.filter(isMastered).length,
  };
}

/** "hôm nay", "ngày mai", "sau 3 ngày" — when a phrase is next due. */
export function dueLabel(dueAt: number, now = Date.now()): string {
  if (dueAt <= now) return "cần ôn hôm nay";
  const days = Math.ceil((dueAt - now) / DAY);
  return days <= 1 ? "ôn lại ngày mai" : `ôn lại sau ${days} ngày`;
}

/** Validate one incoming phrase from a request body. Returns null when unusable. */
export function readNewPhrase(input: unknown): NewPhrase | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  const text = typeof v.text === "string" ? cleanPhraseText(v.text) : "";
  if (!text || !phraseKey(text)) return null;
  const source: PhraseSource = v.source === "chat" || v.source === "script" ? v.source : "manual";
  const str = (x: unknown, max: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : undefined);
  return {
    text,
    original: str(v.original, MAX_PHRASE_LENGTH),
    note: str(v.note, MAX_NOTE_LENGTH),
    source,
    context: str(v.context, 120),
  };
}
