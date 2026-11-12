/**
 * Pure logic for the "natural conversation" mode: topics, levels, prompts and
 * request validation. No DOM, no Web Speech API, no network — usable from both
 * the route handlers and the client.
 */

export type ChatRole = "user" | "assistant";
export type ChatTurn = { role: ChatRole; text: string };

export type LevelId = "beginner" | "intermediate" | "advanced";

export const LEVELS: { id: LevelId; label: string; prompt: string }[] = [
  {
    id: "beginner",
    label: "Mới bắt đầu",
    prompt: "Beginner (A1–A2): use very common words, short simple sentences, speak slowly and clearly.",
  },
  {
    id: "intermediate",
    label: "Trung cấp",
    prompt: "Intermediate (B1–B2): everyday vocabulary and natural phrasing; avoid rare idioms.",
  },
  {
    id: "advanced",
    label: "Nâng cao",
    prompt: "Advanced (C1+): speak naturally like a native speaker, including common idioms.",
  },
];

export type Topic = { id: string; label: string; emoji: string; prompt: string };

export const TOPICS: Topic[] = [
  {
    id: "small-talk",
    label: "Làm quen, tán gẫu",
    emoji: "👋",
    prompt: "Casual small talk between two people who just met at a friend's party. You are a friendly guest.",
  },
  {
    id: "cafe",
    label: "Gọi đồ ở quán cà phê",
    emoji: "☕",
    prompt: "The learner is a customer at a coffee shop. You are the barista taking their order.",
  },
  {
    id: "interview",
    label: "Phỏng vấn xin việc",
    emoji: "💼",
    prompt:
      "A job interview for an office job the learner chooses. You are the interviewer; ask one question at a time.",
  },
  {
    id: "travel",
    label: "Du lịch, sân bay",
    emoji: "✈️",
    prompt: "The learner is a traveller at an airport check-in desk. You are the airline check-in agent.",
  },
  {
    id: "hotel",
    label: "Nhận phòng khách sạn",
    emoji: "🏨",
    prompt: "The learner is checking in at a hotel. You are the front-desk receptionist.",
  },
  {
    id: "doctor",
    label: "Đi khám bệnh",
    emoji: "🩺",
    prompt: "The learner is visiting a doctor with a minor health problem. You are the doctor.",
  },
];

export const CUSTOM_TOPIC_ID = "custom";
export const MAX_TURNS = 30;
export const MAX_TEXT_LENGTH = 800;
export const MAX_CUSTOM_TOPIC_LENGTH = 300;

export function scenarioFor(topicId: string, customTopic?: string): string {
  if (topicId === CUSTOM_TOPIC_ID && customTopic?.trim()) {
    return `A conversation about this topic chosen by the learner: "${customTopic.trim()}". Play whatever role fits best.`;
  }
  return (TOPICS.find((t) => t.id === topicId) ?? TOPICS[0]).prompt;
}

export function levelPrompt(level: string): string {
  return (LEVELS.find((l) => l.id === level) ?? LEVELS[1]).prompt;
}

export function buildReplySystemPrompt(scenario: string, level: string): string {
  return `You are a friendly English conversation partner helping a Vietnamese learner practise speaking English.

Scenario: ${scenario}
Learner level: ${levelPrompt(level)}

How to reply:
- Stay in your role and talk like a real person in a spoken conversation.
- Keep every reply short: 1 to 3 sentences, at most about 40 words.
- Usually end with a question or something that invites the learner to keep talking.
- Do not correct the learner's grammar; feedback is given separately. If you cannot understand them, ask them to say it another way.
- The learner's messages come from speech recognition, so they may lack punctuation or contain misheard words. Interpret them charitably.
- Your reply is read aloud by text-to-speech: plain sentences only, no markdown, emoji, lists or stage directions.
- Always reply in English. If the learner writes Vietnamese or seems stuck, gently help them say it in English.`;
}

/** Used as the first user turn so the model opens the conversation. */
export const START_INSTRUCTION =
  "[The learner has just joined. Start the role-play now: greet them in character and open the scenario with one question.]";

export function buildFeedbackSystemPrompt(level: string): string {
  return `You are an English teacher reviewing ONE thing a Vietnamese learner said in a spoken English conversation.
Learner level: ${levelPrompt(level)}

The sentence came from speech recognition. Ignore capitalization, missing punctuation and words that were probably just misheard.
Only flag real problems: grammar, wrong word choice, or phrasing a native speaker would find unnatural. Keep the learner's meaning and do not over-polish casual speech that is already correct.

Return JSON with:
- verdict: "good" if it is natural and correct, "minor" for small slips, "fix" for clear mistakes.
- corrected: how a native speaker would naturally say the same thing. Repeat the original if it is already natural.
- explanation: in Vietnamese, one or two short sentences about the main issue. Empty string when verdict is "good".`;
}

export function buildFeedbackUserPrompt(history: ChatTurn[], utterance: string): string {
  const context = history
    .slice(-6)
    .map((t) => `${t.role === "assistant" ? "Partner" : "Learner"}: ${t.text}`)
    .join("\n");
  return `Recent conversation (most recent last):\n${context || "(none)"}\n\nSentence to review: "${utterance}"`;
}

/** JSON schema for feedback; with a mission it also asks which goals the sentence completed. */
export function feedbackSchema(withGoals: boolean) {
  return {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["good", "minor", "fix"] },
      corrected: { type: "string" },
      explanation: { type: "string" },
      ...(withGoals ? { goalsDone: { type: "array", items: { type: "integer" } } } : {}),
    },
    required: ["verdict", "corrected", "explanation", ...(withGoals ? ["goalsDone"] : [])],
  };
}

export type Feedback = {
  verdict: "good" | "minor" | "fix";
  corrected: string;
  explanation: string;
  /** Mission goals (indexes) this sentence completed. Only present in a session with a mission. */
  goalsDone?: number[];
};

export function parseFeedback(raw: string): Feedback | null {
  try {
    const v = JSON.parse(raw);
    if (
      v &&
      ["good", "minor", "fix"].includes(v.verdict) &&
      typeof v.corrected === "string" &&
      typeof v.explanation === "string"
    ) {
      const fb: Feedback = { verdict: v.verdict, corrected: v.corrected.trim(), explanation: v.explanation.trim() };
      if (Array.isArray(v.goalsDone)) fb.goalsDone = v.goalsDone.filter((i: unknown) => Number.isInteger(i));
      return fb;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Validate and normalise a history array coming from the client. Returns null if invalid. */
export function sanitizeHistory(input: unknown): ChatTurn[] | null {
  if (!Array.isArray(input)) return null;
  const turns: ChatTurn[] = [];
  for (const item of input) {
    if (!item || (item.role !== "user" && item.role !== "assistant") || typeof item.text !== "string") return null;
    const text = item.text.trim().slice(0, MAX_TEXT_LENGTH);
    if (text) turns.push({ role: item.role, text });
  }
  return turns.slice(-MAX_TURNS);
}
