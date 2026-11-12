export type Line = { id: number; speaker: string; text: string };
export type ParsedScript = { title: string; lines: Line[]; speakers: string[] };

const SPEAKER_RE = /^([^:0-9()[\]]{1,25}):\s*(.*)$/;

/**
 * Parse a script like:
 *   # Title (optional)
 *   A: Hello there!
 *   B: Hi, how are you?
 * Lines without a "Name:" prefix are appended to the previous line.
 */
export function parseScript(raw: string): ParsedScript {
  const lines: Line[] = [];
  let title = "";
  for (const rawLine of raw.split(/\r?\n/)) {
    const l = rawLine.trim();
    if (!l) continue;
    if (l.startsWith("#")) {
      if (!title) title = l.replace(/^#+\s*/, "");
      continue;
    }
    const m = l.match(SPEAKER_RE);
    if (m) {
      lines.push({ id: lines.length, speaker: m[1].trim(), text: m[2].trim() });
    } else if (lines.length) {
      const prev = lines[lines.length - 1];
      prev.text = (prev.text + " " + l).trim();
    }
  }
  const filtered = lines.filter((l) => l.text).map((l, i) => ({ ...l, id: i }));
  const speakers = [...new Set(filtered.map((l) => l.speaker))];
  return { title, lines: filtered, speakers };
}

/** Remove stage directions like (laughs) or [pause] before text-to-speech. */
export function cleanForSpeech(text: string): string {
  return text.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
}

/** "I'm fine, thanks." -> "I'_ f___, t_____." */
export function hintText(text: string): string {
  return text.replace(/[A-Za-z]+/g, (w) => w[0] + "_".repeat(w.length - 1));
}

const NUMBERS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty",
];

function expandWord(w: string): string[] {
  if (w === "okay") return ["ok"];
  if (/^\d+$/.test(w) && Number(w) <= 20) return [NUMBERS[Number(w)]];
  if (w === "can't" || w === "cannot") return ["can", "not"];
  if (w === "won't") return ["will", "not"];
  if (w === "shan't") return ["shall", "not"];
  if (w.endsWith("n't")) return [w.slice(0, -3), "not"];
  const suffixes: [string, string][] = [
    ["'re", "are"], ["'ve", "have"], ["'ll", "will"], ["'m", "am"], ["'d", "would"], ["'s", "is"],
  ];
  for (const [suf, full] of suffixes) {
    if (w.endsWith(suf) && w.length > suf.length) return [w.slice(0, -suf.length), full];
  }
  return [w];
}

function normalizeWord(word: string): string[] {
  const cleaned = word
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'\- ]/g, " ");
  return cleaned
    .split(/[\s-]+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean)
    .flatMap(expandWord);
}

export function normalizeSentence(text: string): string[] {
  return cleanForSpeech(text).split(/\s+/).flatMap(normalizeWord);
}

export type WordMark = { text: string; status: "ok" | "miss" | "neutral" };
export type Comparison = { score: number; words: WordMark[] };

function lcsMatches(a: string[], b: string[]): boolean[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matched = new Array(n).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      matched[i] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return matched;
}

/** Compare what the user said against the expected line, word by word. */
export function compareLine(expected: string, spoken: string): Comparison {
  const displayTokens = expected.split(/\s+/).filter(Boolean);
  const flat: { word: string; owner: number }[] = [];
  let inParen = false;
  const isStage: boolean[] = [];
  displayTokens.forEach((tok, idx) => {
    if (/^[([]/.test(tok)) inParen = true;
    isStage[idx] = inParen;
    if (!inParen) for (const w of normalizeWord(tok)) flat.push({ word: w, owner: idx });
    if (/[)\]][.,!?]*$/.test(tok)) inParen = false;
  });

  const spokenWords = normalizeSentence(spoken);
  const matched = lcsMatches(
    flat.map((f) => f.word),
    spokenWords,
  );
  const matchCount = matched.filter(Boolean).length;
  const total = flat.length + spokenWords.length;
  const score = total === 0 ? 100 : Math.round((200 * matchCount) / total);

  const words: WordMark[] = displayTokens.map((text, idx) => {
    const parts = flat.map((f, k) => ({ ...f, ok: matched[k] })).filter((f) => f.owner === idx);
    if (isStage[idx] || parts.length === 0) return { text, status: "neutral" };
    return { text, status: parts.every((p) => p.ok) ? "ok" : "miss" };
  });
  return { score, words };
}

export const SAMPLE_SCRIPT = `# At the coffee shop
A: Hi there! What can I get for you today?
B: Hi, can I have a medium latte, please?
A: Sure. Would you like it hot or iced?
B: Iced, please. And could I get it with oat milk?
A: Of course. Anything else?
B: Yes, I'll also take a blueberry muffin.
A: Great. That'll be eight fifty. For here or to go?
B: To go, please. Can I pay by card?
A: Absolutely. Just tap your card on the reader.
B: Thank you so much. Have a nice day!
A: You too! Your order will be ready in a minute.
`;
