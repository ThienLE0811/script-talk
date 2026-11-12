/** Pure helpers for the script practice session. No DOM, no Web Speech API. */
import type { ParsedScript } from "./script";

export type LineOutcome = { score: number } | { skipped: true } | undefined;

const RETRY_SUFFIX = " · luyện lại câu chưa đạt";

/** Indexes of the learner's lines that were skipped, never answered, or scored below the threshold. */
export function failedLineIndexes(
  script: ParsedScript,
  myRoles: string[],
  results: Record<number, LineOutcome>,
  threshold: number,
): number[] {
  return script.lines
    .map((line, i) => ({ line, i, r: results[i] }))
    .filter(({ line }) => myRoles.includes(line.speaker))
    .filter(({ r }) => !r || "skipped" in r || r.score < threshold)
    .map(({ i }) => i);
}

/**
 * A smaller script with only the given learner lines, each preceded by the partner line that
 * prompted it (when there is one), so the retry still feels like a conversation.
 */
export function buildRetryScript(script: ParsedScript, myRoles: string[], failed: number[]): ParsedScript {
  const keep = new Set<number>();
  for (const i of failed) {
    if (i < 0 || i >= script.lines.length) continue;
    const prev = i - 1;
    if (prev >= 0 && !myRoles.includes(script.lines[prev].speaker)) keep.add(prev);
    keep.add(i);
  }
  const lines = [...keep].sort((a, b) => a - b).map((i, n) => ({ ...script.lines[i], id: n }));
  const base = (script.title || "Hội thoại").replace(RETRY_SUFFIX, "");
  return { title: base + RETRY_SUFFIX, lines, speakers: [...new Set(lines.map((l) => l.speaker))] };
}
