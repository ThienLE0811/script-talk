/**
 * Pure logic for the end-of-conversation summary and for turning a conversation into a script.
 * No DOM, no network.
 */
import { levelPrompt, type ChatTurn } from "./prompts";

export type Correction = { original: string; corrected: string; explanation: string };

export type ChatSummary = {
  overall: string;
  strengths: string[];
  focus: { issue: string; example: string; better: string }[];
  phrases: { phrase: string; meaning: string }[];
};

export const MAX_CORRECTIONS = 20;

export const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    overall: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    focus: {
      type: "array",
      items: {
        type: "object",
        properties: { issue: { type: "string" }, example: { type: "string" }, better: { type: "string" } },
        required: ["issue", "example", "better"],
      },
    },
    phrases: {
      type: "array",
      items: {
        type: "object",
        properties: { phrase: { type: "string" }, meaning: { type: "string" } },
        required: ["phrase", "meaning"],
      },
    },
  },
  required: ["overall", "strengths", "focus", "phrases"],
} as const;

export function buildSummarySystemPrompt(scenario: string, level: string): string {
  return `You are an encouraging English teacher. A Vietnamese learner has just finished a spoken practice conversation with an AI partner.
Scenario: ${scenario}
Learner level: ${levelPrompt(level)}

The learner's lines came from speech recognition, so ignore punctuation, capitalization and words that were probably misheard.
Summarise how the learner did. Write every explanation in Vietnamese; keep English examples and phrases in English.

Return JSON with:
- overall: 1 or 2 warm, honest sentences in Vietnamese about how the learner did.
- strengths: up to 3 short points in Vietnamese about what they did well.
- focus: up to 3 recurring problems worth practising, most important first. issue: the problem explained in Vietnamese; example: the learner's own words that show it; better: how to say it naturally in English. Empty if there were no real problems.
- phrases: up to 5 useful English phrases for this situation that the learner could learn next (from the partner's lines or natural alternatives), each with a short Vietnamese meaning.`;
}

export function buildSummaryUserPrompt(history: ChatTurn[], corrections: Correction[]): string {
  const transcript = history.map((t) => `${t.role === "assistant" ? "Partner" : "Learner"}: ${t.text}`).join("\n");
  const notes = corrections.length
    ? corrections.map((c) => `- "${c.original}" → "${c.corrected}" (${c.explanation})`).join("\n")
    : "(none)";
  return `Conversation:\n${transcript}\n\nCorrections already shown to the learner during the conversation:\n${notes}`;
}

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseSummary(raw: string): ChatSummary | null {
  try {
    return parseSummaryObject(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Validate a summary object (from the model, or saved with a conversation). */
export function parseSummaryObject(v: unknown): ChatSummary | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  const overall = str(d.overall, 600);
  if (!overall) return null;
  const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  return {
    overall,
    strengths: arr(d.strengths).map((s) => str(s)).filter(Boolean).slice(0, 3),
    focus: arr(d.focus)
      .map((f) => ({ issue: str(f?.issue), example: str(f?.example), better: str(f?.better) }))
      .filter((f) => f.issue && f.better)
      .slice(0, 3),
    phrases: arr(d.phrases)
      .map((p) => ({ phrase: str(p?.phrase, 120), meaning: str(p?.meaning, 200) }))
      .filter((p) => p.phrase)
      .slice(0, 5),
  };
}

/** Speaker names used when a conversation is saved as a script. */
export const CHAT_SCRIPT_PARTNER = "Partner";
export const CHAT_SCRIPT_ME = "Me";

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Turn a conversation into script text. The learner's lines use the corrected sentence when
 * there is one, so rehearsing the script drills the natural version.
 */
export function chatToScript(turns: (ChatTurn & { corrected?: string })[], title: string): string {
  const lines = turns
    .map((t) => {
      const text = oneLine(t.role === "user" && t.corrected ? t.corrected : t.text);
      return text ? `${t.role === "assistant" ? CHAT_SCRIPT_PARTNER : CHAT_SCRIPT_ME}: ${text}` : "";
    })
    .filter(Boolean);
  const heading = oneLine(title).replace(/^#+\s*/, "") || "Conversation";
  return `# ${heading}\n${lines.join("\n")}\n`;
}
