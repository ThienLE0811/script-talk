/**
 * Pure logic for "missions": concrete goals the learner has to reach in a role-play
 * (for example: book 2 nights, ask whether breakfast is included, ask for a discount).
 * No DOM, no network.
 */
import { levelPrompt } from "./prompts";

export type Mission = {
  /** One sentence in Vietnamese setting the scene for the learner. */
  brief: string;
  /** Goals in Vietnamese, in a natural order. */
  goals: string[];
};

export const MAX_GOALS = 4;
const MAX_BRIEF_LENGTH = 300;
const MAX_GOAL_LENGTH = 160;

export const MISSION_SCHEMA = {
  type: "object",
  properties: {
    brief: { type: "string" },
    goals: { type: "array", items: { type: "string" } },
  },
  required: ["brief", "goals"],
} as const;

export function buildMissionSystemPrompt(scenario: string, level: string): string {
  return `You design a short speaking mission for a Vietnamese learner of English who is about to start a role-play with an AI partner.
Scenario: ${scenario}
Learner level: ${levelPrompt(level)}

Give the learner a concrete reason to talk, like a real errand: specific details (numbers, dates, preferences) and things to find out or ask for.
- brief: one sentence in Vietnamese saying who the learner is and what they want, e.g. "Bạn đến khách sạn và muốn đặt phòng cho chuyến công tác."
- goals: exactly 3 short goals in Vietnamese, each one concrete action the learner must do by speaking, e.g. "Đặt phòng đôi cho 2 đêm", "Hỏi giá có gồm bữa sáng không", "Xin giảm giá". Order them the way they would come up in the conversation. Match the difficulty to the learner's level.
Vary the details every time so repeated practice stays fresh.`;
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Validate a mission from the model or from the client. */
export function readMission(input: unknown): Mission | null {
  if (!input || typeof input !== "object") return null;
  const d = input as Record<string, unknown>;
  const goals = (Array.isArray(d.goals) ? d.goals : [])
    .map((g) => clean(g, MAX_GOAL_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_GOALS);
  if (!goals.length) return null;
  return { brief: clean(d.brief, MAX_BRIEF_LENGTH), goals };
}

export function parseMission(raw: string): Mission | null {
  try {
    return readMission(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Valid, de-duplicated goal indexes. */
export function readGoalIndexes(input: unknown, goalCount: number): number[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < goalCount))].sort(
    (a, b) => a - b,
  );
}

const goalList = (goals: string[], indexes: number[]) => indexes.map((i) => `[${i}] ${goals[i]}`).join("\n");

/** Added to the partner's system prompt so it plays along without doing the learner's job. */
export function missionPartnerPrompt(mission: Mission): string {
  return `
The learner has a mission (written in Vietnamese for them): ${mission.brief}
Their goals:
${goalList(mission.goals, mission.goals.map((_, i) => i))}
Play your role so these goals can be reached naturally, with realistic details (prices, availability, options). Let the learner take the lead: do not offer the information or do the goals for them before they ask, but you may give small hints if they seem stuck.`;
}

/** Added to the feedback prompt: which still-open goals did this sentence complete? */
export function missionFeedbackPrompt(mission: Mission, done: number[]): string {
  const open = mission.goals.map((_, i) => i).filter((i) => !done.includes(i));
  if (!open.length) return "";
  return `

The learner is also working on these mission goals (in Vietnamese), shown with their numbers:
${goalList(mission.goals, open)}
- goalsDone: the numbers of the goals above that the learner's sentence clearly accomplishes, using the conversation for context (for example they actually asked the question or stated the request). A goal counts even if the grammar is wrong, as long as the meaning is clear. Empty array if none.`;
}

/** Text for the summary prompt describing how far the learner got. */
export function missionSummaryNote(mission: Mission, done: number[]): string {
  const lines = mission.goals.map((g, i) => `- ${done.includes(i) ? "[done]" : "[not done]"} ${g}`).join("\n");
  return `\n\nThe learner had a mission: ${mission.brief}\nGoals (in Vietnamese):\n${lines}\nMention in "overall" whether they completed the mission.`;
}
