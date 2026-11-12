/**
 * Pure logic for the progress overview: practice days and streaks (in the learner's local time),
 * session counts and how the share of natural sentences moves over time. No DOM, no network.
 */
import type { ChatSessionMeta } from "./chat/history";

type SessionLike = Pick<ChatSessionMeta, "id" | "topicLabel" | "stats" | "activity" | "createdAt" | "focus">;

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar day, e.g. "2026-11-12". */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Same time of day, `n` calendar days later (safe across daylight-saving changes). */
function shiftDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

const keyToTime = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};

/** Days with any practice: something said in a conversation, or a phrase reviewed. */
export function practiceDays(sessions: Pick<SessionLike, "activity" | "createdAt">[], reviewTimes: number[]): Set<string> {
  const days = new Set<string>();
  for (const s of sessions) {
    const times = s.activity.length ? s.activity : [s.createdAt];
    for (const t of times) days.add(dayKey(t));
  }
  for (const t of reviewTimes) days.add(dayKey(t));
  return days;
}

/**
 * Current streak counts back from today, or from yesterday when today has no practice yet
 * (the streak is still alive until the day is over). Best is the longest run ever.
 */
export function streaks(days: Set<string>, now: number): { current: number; best: number; today: boolean } {
  const today = days.has(dayKey(now));
  let current = 0;
  for (let t = today ? now : shiftDays(now, -1); days.has(dayKey(t)); t = shiftDays(t, -1)) current++;

  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of [...days].sort()) {
    run = prev && dayKey(shiftDays(keyToTime(prev), 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  return { current, best, today };
}

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** The last `n` days, oldest first, for the activity strip. */
export function recentDays(days: Set<string>, n: number, now: number) {
  return Array.from({ length: n }, (_, i) => {
    const t = shiftDays(now, i - n + 1);
    const d = new Date(t);
    return {
      key: dayKey(t),
      weekday: WEEKDAYS[d.getDay()],
      date: `${d.getDate()}/${d.getMonth() + 1}`,
      active: days.has(dayKey(t)),
      isToday: i === n - 1,
    };
  });
}

/** Share of reviewed sentences that were already natural, or null when none were reviewed. */
export function naturalRate(stats: { good: number; needsWork: number }): number | null {
  const total = stats.good + stats.needsWork;
  return total ? stats.good / total : null;
}

export type ProgressOverview = {
  sessions: number;
  sessionsThisWeek: number;
  spokenLines: number;
  missionsCompleted: number;
  streak: { current: number; best: number; today: boolean };
  days: ReturnType<typeof recentDays>;
  /** Natural-sentence rate of the most recent sessions (oldest first), for the mini chart. */
  rates: { id: string; topicLabel: string; at: number; rate: number }[];
  /** Average rate of the latest sessions compared with the ones before, in percentage points. */
  trend: { recent: number; earlier: number } | null;
  /** Problems pointed out in the latest summaries, newest first. */
  focus: { issue: string; topicLabel: string; at: number }[];
};

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function progressOverview(
  sessionsInput: SessionLike[],
  reviewTimes: number[],
  now: number,
  { stripDays = 14, chartSessions = 12, trendWindow = 5, focusCount = 5 } = {},
): ProgressOverview {
  const sessions = [...sessionsInput].sort((a, b) => a.createdAt - b.createdAt);
  const days = practiceDays(sessions, reviewTimes);
  const weekAgo = shiftDays(now, -7);

  const rated = sessions.flatMap((s) => {
    const rate = naturalRate(s.stats);
    return rate === null ? [] : [{ id: s.id, topicLabel: s.topicLabel, at: s.createdAt, rate }];
  });
  const recent = rated.slice(-trendWindow).map((r) => r.rate);
  const earlier = rated.slice(-2 * trendWindow, -trendWindow).map((r) => r.rate);

  return {
    sessions: sessions.length,
    sessionsThisWeek: sessions.filter((s) => s.createdAt >= weekAgo).length,
    spokenLines: sessions.reduce((n, s) => n + s.stats.userTurns, 0),
    missionsCompleted: sessions.filter((s) => s.stats.goalCount > 0 && s.stats.goalsDone >= s.stats.goalCount).length,
    streak: streaks(days, now),
    days: recentDays(days, stripDays, now),
    rates: rated.slice(-chartSessions),
    trend: recent.length && earlier.length ? { recent: avg(recent), earlier: avg(earlier) } : null,
    focus: [...sessions]
      .reverse()
      .flatMap((s) => s.focus.map((issue) => ({ issue, topicLabel: s.topicLabel, at: s.createdAt })))
      .slice(0, focusCount),
  };
}

/** "Hôm nay", "Hôm qua", "3 ngày trước" or a date. */
export function relativeDayLabel(ts: number, now: number): string {
  const diff = Math.round((keyToTime(dayKey(now)) - keyToTime(dayKey(ts))) / 86_400_000);
  if (diff <= 0) return "Hôm nay";
  if (diff === 1) return "Hôm qua";
  if (diff < 7) return `${diff} ngày trước`;
  const d = new Date(ts);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
