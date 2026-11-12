// Bộ case cho parser và chấm điểm của ScriptTalk.
// Chạy: node .claude/skills/scripttalk-parser-cases/check.mts   (Node >= 22.18)
import {
  parseScript,
  cleanForSpeech,
  normalizeSentence,
  compareLine,
  SAMPLE_SCRIPT,
} from "../../../src/lib/script.ts";

let failed = 0;
let passed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.log(`FAIL  ${name}\n      expected: ${e}\n      actual:   ${a}`);
  }
}

const lines = (raw: string) => parseScript(raw).lines.map((l) => [l.speaker, l.text]);

/* ---------------- parseScript ---------------- */

{
  const p = parseScript(SAMPLE_SCRIPT);
  check("sample: title", p.title, "At the coffee shop");
  check("sample: line count", p.lines.length, 11);
  check("sample: speakers", p.speakers, ["A", "B"]);
  check("sample: ids are 0..n-1", p.lines.map((l) => l.id), [...Array(11).keys()]);
}

check("colon inside dialogue", lines("A: It's 10:30. See you at 11:00."), [["A", "It's 10:30. See you at 11:00."]]);
check("speaker name with spaces", lines("Mr Smith: Hello."), [["Mr Smith", "Hello."]]);
check("continuation line is appended", lines("A: Hello\nthere, friend.\nB: Hi."), [["A", "Hello there, friend."], ["B", "Hi."]]);
check("line before any speaker is dropped", lines("hello\nA: Hi."), [["A", "Hi."]]);
check("blank lines and CRLF", lines("A: One.\r\n\r\n   \r\nB: Two."), [["A", "One."], ["B", "Two."]]);
check("only the first # is the title", parseScript("# First\n# Second\nA: Hi.").title, "First");
check("# lines are not dialogue", lines("# T\nA: Hi.\n# note\nB: Yo."), [["A", "Hi."], ["B", "Yo."]]);
check("speaker with empty text is dropped", lines("A:\nB: Hi."), [["B", "Hi."]]);
check("empty speaker then continuation keeps it", lines("A:\nHello."), [["A", "Hello."]]);
check("notes stay in displayed text", lines("B: (laughs) Sure [pause] thing."), [["B", "(laughs) Sure [pause] thing."]]);
check("empty script", parseScript("").lines, []);

/* ---------------- cleanForSpeech ---------------- */

check("clean: removes () and []", cleanForSpeech("(laughs) Sure [pause] thing."), "Sure thing.");
check("clean: unclosed paren is left alone", cleanForSpeech("Hello (oops world"), "Hello (oops world");

/* ---------------- normalizeSentence ---------------- */

check("normalize: punctuation and case", normalizeSentence("Hi, THERE!"), ["hi", "there"]);
check("normalize: contractions", normalizeSentence("I'm sure you'll"), ["i", "am", "sure", "you", "will"]);
check("normalize: n't", normalizeSentence("Don't-stop"), ["do", "not", "stop"]);
check("normalize: can't / won't", normalizeSentence("can't won't"), ["can", "not", "will", "not"]);
check("normalize: curly apostrophe", normalizeSentence("I’m"), ["i", "am"]);
check("normalize: small numbers", normalizeSentence("10 apples"), ["ten", "apples"]);
check("normalize: okay = ok", normalizeSentence("Okay"), ["ok"]);
check("normalize: notes removed", normalizeSentence("(smiling) Hi"), ["hi"]);

/* ---------------- compareLine ---------------- */

const score = (e: string, s: string) => compareLine(e, s).score;
const marks = (e: string, s: string) => compareLine(e, s).words.map((w) => w.status);

check("score: exact", score("Can I have a latte, please?", "can I have a latte please"), 100);
check("score: contraction vs full", score("I'm fine, thanks.", "I am fine thanks"), 100);
check("score: digit vs word", score("I have 10 apples.", "I have ten apples"), 100);
check("score: okay vs ok", score("Okay, sure.", "ok sure"), 100);
check("score: notes ignored", score("(smiling) Hi there!", "hi there"), 100);
check("score: nothing said", score("Hi there!", ""), 0);
check("score: empty line and empty speech", score("(pause)", ""), 100);
check("marks: missing word", marks("Can I have a latte", "can I have latte"), ["ok", "ok", "ok", "miss", "ok"]);
check("marks: note is neutral", marks("(smiling) Hi there!", "hi there"), ["neutral", "ok", "ok"]);
check("marks: multi-word note is neutral", marks("Sure (long pause) thing", "sure thing"), ["ok", "neutral", "neutral", "ok"]);
check("marks: contraction token needs both parts", marks("I'm fine", "I fine"), ["miss", "ok"]);
check("score: extra words lower the score", score("Hi there", "hi there my friend") < 100, true);
check("no crash: unclosed paren", typeof score("Hello (oops world", "hello"), "number");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
