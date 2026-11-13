/**
 * Pure logic for the helpers around a conversation: speaking a streamed reply sentence by sentence,
 * reply suggestions when the learner is stuck, and Vietnamese translations of the partner's lines.
 * No DOM, no network.
 */
import { CHALLENGE_SUGGEST_NOTE } from "./challenge";
import type { Mission } from "./mission";
import { levelPrompt, type ChatTurn } from "./prompts";

/* ---------- Speak while streaming ---------- */

// "Mr. Smith" or "e.g. this" must not be cut after the dot.
const ABBREVIATIONS = /(?:^|\s)(?:mr|mrs|ms|dr|prof|st|vs|etc|e\.g|i\.e|a\.m|p\.m)\.$/i;

/**
 * Split off the complete sentences of a partially streamed reply, starting at `from`.
 * A sentence ends at `.`, `!` or `?` (plus closing quotes) followed by whitespace, so "3.5" or a
 * sentence still being streamed is never cut. Pass `final` once the stream has ended to flush the rest.
 */
export function takeSentences(text: string, from: number, final = false): { sentences: string[]; next: number } {
  const sentences: string[] = [];
  let start = from;
  const re = /[.!?]+["'”’)]*\s+/g;
  re.lastIndex = from;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    const sentence = text.slice(start, end).trim();
    if (ABBREVIATIONS.test(text.slice(start, m.index + 1))) continue;
    if (sentence) sentences.push(sentence);
    start = end;
  }
  if (final) {
    const rest = text.slice(start).trim();
    if (rest) sentences.push(rest);
    start = text.length;
  }
  return { sentences, next: start };
}

/* ---------- Reply suggestions ---------- */

export type ReplySuggestion = { text: string; vi: string };

export const SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, vi: { type: "string" } },
        required: ["text", "vi"],
      },
    },
  },
  required: ["suggestions"],
} as const;

export function buildSuggestSystemPrompt(
  scenario: string,
  level: string,
  mission?: Mission | null,
  challenge = false,
): string {
  const missionNote = mission
    ? `
The learner has a mission: ${mission.brief}
Goals (in Vietnamese): ${mission.goals.join("; ")}
Prefer suggestions that move the mission forward.
`
    : "";
  return `You help a Vietnamese learner who is stuck in a spoken English role-play and does not know what to say next.
Scenario: ${scenario}
Learner level: ${levelPrompt(level)}
${missionNote}${challenge ? CHALLENGE_SUGGEST_NOTE : ""}
Suggest 3 different things the learner could say next in reply to the partner's last line, in the learner's role.
- Each suggestion is one or two short, natural spoken sentences that fit the learner's level.
- Make them genuinely different (for example: a simple answer, an answer with a detail, a question back).
- text: the English sentence, plain text only. vi: its meaning in natural Vietnamese.

Return JSON: { "suggestions": [{ "text": "...", "vi": "..." }] }`;
}

export function buildSuggestUserPrompt(history: ChatTurn[]): string {
  const transcript = history
    .slice(-10)
    .map((t) => `${t.role === "assistant" ? "Partner" : "Learner"}: ${t.text}`)
    .join("\n");
  return `Conversation so far (most recent last):\n${transcript}\n\nWhat could the learner say next?`;
}

export function parseSuggestions(raw: string): ReplySuggestion[] | null {
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v?.suggestions)) return null;
    const list = (v.suggestions as unknown[])
      .filter(
        (s): s is ReplySuggestion =>
          !!s && typeof (s as ReplySuggestion).text === "string" && typeof (s as ReplySuggestion).vi === "string",
      )
      .map((s) => ({ text: s.text.trim(), vi: s.vi.trim() }))
      .filter((s) => s.text)
      .slice(0, 3);
    return list.length ? list : null;
  } catch {
    return null;
  }
}

/* ---------- Translation ---------- */

export const TRANSLATE_SYSTEM_PROMPT = `Translate the English line from a spoken conversation into natural, everyday Vietnamese for a Vietnamese learner of English.
Reply with the Vietnamese translation only: no quotes, notes, romanisation or the original text.`;
