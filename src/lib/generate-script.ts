/**
 * Pure logic for "AI writes a script": prompt, JSON schema and conversion of the model output
 * into the script syntax (`# Title` + `Role: line`). No DOM, no network.
 */
import { levelPrompt } from "./chat/prompts";

export type ScriptLength = "short" | "medium" | "long";

export const SCRIPT_LENGTHS: { id: ScriptLength; label: string; lines: number }[] = [
  { id: "short", label: "Ngắn (~6 câu)", lines: 6 },
  { id: "medium", label: "Vừa (~10 câu)", lines: 10 },
  { id: "long", label: "Dài (~16 câu)", lines: 16 },
];

export const MAX_TOPIC_LENGTH = 200;

export const TOPIC_SUGGESTIONS = [
  "Trả phòng khách sạn",
  "Hỏi đường ở ga tàu",
  "Đặt bàn nhà hàng qua điện thoại",
  "Họp nhóm đầu tuần ở công ty",
  "Đổi trả hàng ở cửa hàng quần áo",
  "Làm quen bạn mới ở phòng gym",
];

export const GENERATE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    learnerRole: { type: "string" },
    partnerRole: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          speaker: { type: "string", enum: ["partner", "learner"] },
          text: { type: "string" },
        },
        required: ["speaker", "text"],
      },
    },
  },
  required: ["title", "learnerRole", "partnerRole", "lines"],
} as const;

export function buildGenerateSystemPrompt(level: string, length: ScriptLength): string {
  const lines = (SCRIPT_LENGTHS.find((l) => l.id === length) ?? SCRIPT_LENGTHS[1]).lines;
  return `You write short English dialogues that a Vietnamese learner will rehearse out loud, sentence by sentence.

Learner level: ${levelPrompt(level)}

Write one realistic dialogue between two people:
- The learner plays one role, the "partner" plays the other. The partner speaks first, then they alternate.
- About ${lines} lines in total. Each line is 1 or 2 natural spoken sentences that suit the level.
- Use everyday spoken English that people really say; include a few useful phrases for the situation.
- Role names: short English nouns of 1 or 2 words, letters only (for example "Receptionist" and "Guest").
- Title: a short English title for the situation.
- No narration, stage directions, markdown, emoji or line breaks inside a line.
- The topic may be written in Vietnamese; the dialogue must be in English.`;
}

export function buildGenerateUserPrompt(topic: string): string {
  return `Topic: ${topic}`;
}

export type GeneratedScript = { title: string; raw: string; learnerRole: string; partnerRole: string; lineCount: number };

/** Keep role names safe for the parser: letters and spaces only, short, never empty. */
export function cleanRoleName(name: unknown, fallback: string): string {
  const cleaned =
    typeof name === "string"
      ? name
          .replace(/[^A-Za-z ]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 20)
          .trim()
      : "";
  return cleaned || fallback;
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** Convert the model's JSON output into script text. Returns null when it is unusable. */
export function toGeneratedScript(json: string): GeneratedScript | null {
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const data = v as { title?: unknown; learnerRole?: unknown; partnerRole?: unknown; lines?: unknown };
  if (!Array.isArray(data.lines)) return null;

  const partnerRole = cleanRoleName(data.partnerRole, "Partner");
  let learnerRole = cleanRoleName(data.learnerRole, "Me");
  if (learnerRole.toLowerCase() === partnerRole.toLowerCase()) {
    learnerRole = partnerRole.toLowerCase() === "me" ? "You" : "Me";
  }

  const lines: string[] = [];
  for (const item of data.lines) {
    if (!item || typeof item !== "object") continue;
    const { speaker, text } = item as { speaker?: unknown; text?: unknown };
    if ((speaker !== "partner" && speaker !== "learner") || typeof text !== "string" || !oneLine(text)) continue;
    lines.push(`${speaker === "learner" ? learnerRole : partnerRole}: ${oneLine(text)}`);
  }
  if (lines.length < 2) return null;

  const title = typeof data.title === "string" && oneLine(data.title) ? oneLine(data.title).replace(/^#+\s*/, "").slice(0, 80) : "AI dialogue";
  return { title, raw: `# ${title}\n${lines.join("\n")}\n`, learnerRole, partnerRole, lineCount: lines.length };
}
