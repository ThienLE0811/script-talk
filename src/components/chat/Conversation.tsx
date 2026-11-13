"use client";

import {
  CheckCircle2Icon,
  LanguagesIcon,
  LightbulbIcon,
  Loader2Icon,
  LogOutIcon,
  MicIcon,
  NotebookPenIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SparklesIcon,
  SquareIcon,
  TriangleAlertIcon,
  Volume2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { aiErrorText, AiRequestError, postJSON, readAiError } from "@/lib/ai-errors";
import { takeSentences, type ReplySuggestion } from "@/lib/chat/assist";
import { completedGoals, type ChatSession, type ChatSessionInput, type SavedTurn } from "@/lib/chat/history";
import type { Mission } from "@/lib/chat/mission";
import { LEVELS, TOPICS, CUSTOM_TOPIC_ID, type ChatRole, type ChatTurn, type Feedback } from "@/lib/chat/prompts";
import { CHAT_SCRIPT_ME, chatToScript, type ChatSummary, type Correction } from "@/lib/chat/summary";
import { saveChat, saveChatOnExit } from "@/lib/chats-client";
import { addPhrases } from "@/lib/phrases-client";
import { createScript } from "@/lib/scripts-client";
import { queueScriptForPractice, type SavedScript } from "@/lib/settings";
import { speak, startListening, stopSpeaking, type ListenController } from "@/lib/speech";
import { cn } from "@/lib/utils";
import type { ChatSettings } from "./ChatPractice";
import { MissionCard, MissionLoading, MissionProgress } from "./MissionBar";
import SessionSummary, { type SummaryState } from "./SessionSummary";

type FeedbackState = { status: "loading" } | { status: "done"; data: Feedback } | { status: "error" };
type TranslationState = { status: "loading" } | { status: "done"; text: string } | { status: "error"; code: string };
type SuggestState = { forId: number } & (
  | { status: "loading" }
  | { status: "done"; items: ReplySuggestion[] }
  | { status: "error"; code: string }
);
type UiTurn = {
  id: number;
  role: ChatRole;
  text: string;
  streaming?: boolean;
  feedback?: FeedbackState;
  /** The corrected sentence was saved to the phrasebook. */
  inPhrasebook?: boolean;
  /** Vietnamese translation of a partner line, fetched on demand. */
  translation?: TranslationState;
  showTranslation?: boolean;
};
type Phase = "thinking" | "speaking" | "listening" | "waiting" | "paused" | "error" | "summary";

const toHistory = (turns: UiTurn[]): ChatTurn[] =>
  turns.filter((t) => !t.streaming && t.text).map((t) => ({ role: t.role, text: t.text }));

const toSaved = (turns: UiTurn[]): SavedTurn[] =>
  turns
    .filter((t) => !t.streaming && t.text)
    .map((t) =>
      t.feedback?.status === "done"
        ? { role: t.role, text: t.text, feedback: t.feedback.data }
        : { role: t.role, text: t.text },
    );

const fromSaved = (turns: SavedTurn[]): UiTurn[] =>
  turns.map((t, i) => ({
    id: i + 1,
    role: t.role,
    text: t.text,
    ...(t.feedback ? { feedback: { status: "done" as const, data: t.feedback } } : {}),
  }));

type Props = {
  settings: ChatSettings;
  voiceURI: string | undefined;
  recSupported: boolean;
  /** Id under which the conversation is saved (collection `chats`). */
  sessionId: string;
  /** A saved conversation to reopen: it starts on its summary, "Trò chuyện tiếp" picks it up again. */
  initial?: ChatSession;
  onExit: () => void;
};

export default function Conversation({ settings, voiceURI, recSupported, sessionId, initial, onExit }: Props) {
  const [turns, setTurns] = useState<UiTurn[]>(() => (initial ? fromSaved(initial.turns) : []));
  const [phase, setPhase] = useState<Phase>(initial ? "summary" : "thinking");
  const [mission, setMission] = useState<Mission | null>(initial?.mission ?? null);
  const [missionLoading, setMissionLoading] = useState(false);
  const [interim, setInterim] = useState("");
  const [notice, setNotice] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [suggest, setSuggest] = useState<SuggestState | null>(null);

  // turnsRef mirrors state so async callbacks always see the latest list.
  const turnsRef = useRef<UiTurn[]>(turns);
  const idRef = useRef(turns.length);
  const missionRef = useRef(mission);
  missionRef.current = mission;
  const tokenRef = useRef(0);
  const recRef = useRef<ListenController | null>(null);
  const replyAbortRef = useRef<AbortController | null>(null);
  const feedbackAborts = useRef(new Set<AbortController>());
  const suggestAbortRef = useRef<AbortController | null>(null);
  const aliveRef = useRef(true);

  const commit = (next: UiTurn[]) => {
    turnsRef.current = next;
    setTurns(next);
  };
  const updateTurn = (id: number, patch: Partial<UiTurn>) =>
    commit(turnsRef.current.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const speechOpts = { voiceURI, rate: settings.rate };
  // A function reading missionRef, so a request sent right after the mission arrives already includes it.
  const requestBase = () => ({
    topicId: settings.topicId,
    customTopic: settings.customTopic,
    level: settings.level,
    mission: missionRef.current ?? undefined,
  });
  const goalsDone = completedGoals(toSaved(turns), mission);

  /** Cancel speech, mic and any in-flight reply; drop a half-streamed reply. Returns a fresh token. */
  const interrupt = () => {
    tokenRef.current++;
    recRef.current?.abort();
    recRef.current = null;
    replyAbortRef.current?.abort();
    replyAbortRef.current = null;
    stopSpeaking();
    if (turnsRef.current.some((t) => t.streaming)) commit(turnsRef.current.filter((t) => !t.streaming));
    return tokenRef.current;
  };

  // Latest versions of the flow functions, for callbacks created in earlier renders.
  const actions = useRef<{ askAI: () => void; submitUser: (text: string) => void }>({
    askAI: () => {},
    submitUser: () => {},
  });

  const listen = (token: number) => {
    setInterim("");
    if (!recSupported) {
      setPhase("waiting");
      return;
    }
    setPhase("listening");
    setNotice("");
    recRef.current = startListening({
      onInterim: (t) => {
        if (tokenRef.current === token) setInterim(t);
      },
      onDone: (text, error) => {
        if (tokenRef.current !== token) return;
        recRef.current = null;
        setInterim("");
        if (text) return actions.current.submitUser(text);
        setPhase("waiting");
        setNotice(
          error === "not-allowed" || error === "service-not-allowed"
            ? "Trình duyệt đang chặn micro. Hãy cho phép micro rồi bấm nút mic để thử lại."
            : error === "network"
              ? "Lỗi mạng: nhận giọng nói của Chrome cần có Internet."
              : "Chưa nghe thấy gì. Bấm nút mic (hoặc phím Space) để nói, hoặc gõ câu trả lời.",
        );
      },
    });
  };

  const askAI = async () => {
    const token = interrupt();
    suggestAbortRef.current?.abort();
    setNotice("");
    setErrorCode(null);
    const history = toHistory(turnsRef.current);
    const id = ++idRef.current;
    commit([...turnsRef.current, { id, role: "assistant", text: "", streaming: true }]);
    setPhase("thinking");

    const ac = new AbortController();
    replyAbortRef.current = ac;
    let text = "";
    // Speak each sentence as soon as it has streamed in, instead of waiting for the whole reply.
    let spokenUpTo = 0;
    let failed = false;
    let speech = Promise.resolve();
    const speakSentences = (final: boolean) => {
      const { sentences, next } = takeSentences(text, spokenUpTo, final);
      spokenUpTo = next;
      for (const s of sentences) {
        speech = speech.then(() => (tokenRef.current === token && !failed ? speak(s, speechOpts) : undefined));
      }
      if (sentences.length) setPhase("speaking");
    };
    try {
      const res = await fetch("/api/chat/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestBase(), history }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw await readAiError(res);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        if (tokenRef.current !== token) return;
        updateTurn(id, { text });
        speakSentences(false);
      }
      text += decoder.decode();
      if (!text.trim()) throw new AiRequestError("upstream_error");
      speakSentences(true);
    } catch (err) {
      if (tokenRef.current !== token) return; // cancelled on purpose
      failed = true;
      stopSpeaking();
      commit(turnsRef.current.filter((t) => t.id !== id));
      setErrorCode(err instanceof AiRequestError ? err.code : "network");
      setPhase("error");
      return;
    }
    if (tokenRef.current !== token) return;
    replyAbortRef.current = null;
    updateTurn(id, { text: text.trim(), streaming: false });
    setPhase("speaking");
    void speech.then(() => {
      if (tokenRef.current === token) listen(token);
    });
  };

  const requestFeedback = async (id: number, history: ChatTurn[], utterance: string) => {
    const ac = new AbortController();
    feedbackAborts.current.add(ac);
    const currentMission = missionRef.current;
    let next: FeedbackState;
    try {
      const res = await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: settings.level,
          history,
          utterance,
          mission: currentMission ?? undefined,
          goalsDone: completedGoals(toSaved(turnsRef.current), currentMission),
        }),
        signal: ac.signal,
      });
      next = res.ok ? { status: "done", data: (await res.json()) as Feedback } : { status: "error" };
    } catch {
      next = { status: "error" };
    } finally {
      feedbackAborts.current.delete(ac);
    }
    if (aliveRef.current) {
      const before = completedGoals(toSaved(turnsRef.current), currentMission);
      updateTurn(id, { feedback: next });
      const after = completedGoals(toSaved(turnsRef.current), currentMission);
      if (currentMission) announceGoals(currentMission, before, after);
    }
    // Saved even if the conversation was closed meanwhile.
    if (next.status === "done" && next.data.verdict !== "good") void saveCorrection(id, utterance, next.data);
  };

  const announceGoals = (m: Mission, before: number[], after: number[]) => {
    const fresh = after.filter((i) => !before.includes(i));
    if (!fresh.length) return;
    if (after.length === m.goals.length) {
      toast.success("Hoàn thành nhiệm vụ!", {
        description: "Bạn có thể nói tiếp, hoặc bấm “Kết thúc” để xem tổng kết.",
      });
    } else {
      for (const i of fresh) toast.success("Xong một mục tiêu", { description: m.goals[i] });
    }
  };

  /** Corrected sentences go to the phrasebook automatically, so they can be reviewed later. */
  const saveCorrection = async (id: number, utterance: string, fb: Feedback) => {
    try {
      await addPhrases([
        { text: fb.corrected, original: utterance, note: fb.explanation, source: "chat", context: topicLabel },
      ]);
      if (aliveRef.current) updateTurn(id, { inPhrasebook: true });
    } catch {
      // Not critical: the correction is still shown and listed in the end-of-session summary.
    }
  };

  const submitUser = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    interrupt();
    setTyped("");
    const history = toHistory(turnsRef.current);
    const id = ++idRef.current;
    commit([...turnsRef.current, { id, role: "user", text, feedback: { status: "loading" } }]);
    void requestFeedback(id, history, text);
    void actions.current.askAI();
  };
  actions.current = { askAI, submitUser };

  const lastTurn = turns[turns.length - 1];
  /** A reply is on its way (possibly already being spoken): other playback must wait. */
  const replying = phase === "thinking" || turns.some((t) => t.streaming);
  const myTurn = lastTurn?.role === "assistant" && !lastTurn.streaming && (phase === "listening" || phase === "waiting");
  /** Suggestions stay visible (also while one is played aloud) until the conversation moves on. */
  const showSuggest = !!lastTurn && suggest?.forId === lastTurn.id && !lastTurn.streaming;

  const pause = () => {
    interrupt();
    setPhase("paused");
  };
  const resume = () => {
    const last = turnsRef.current[turnsRef.current.length - 1];
    if (!last || last.role === "user") void askAI();
    else listen(interrupt());
  };
  const toggleMic = () => {
    if (phase === "listening") recRef.current?.stop();
    else if (phase === "waiting") listen(interrupt());
  };
  /** Play any sentence; when it was the learner's turn, go back to listening afterwards. */
  const replay = (text: string) => {
    if (replying) return;
    const stay = phase === "paused" || phase === "error";
    const token = interrupt();
    if (!stay) setPhase("speaking");
    speak(text, speechOpts).then(() => {
      if (tokenRef.current === token && !stay) listen(token);
    });
  };

  /* ---------- Help while talking: reply suggestions, translations ---------- */

  const fetchSuggestions = async () => {
    const last = turnsRef.current[turnsRef.current.length - 1];
    if (!last || last.role !== "assistant" || last.streaming) return;
    // Stop the mic so it doesn't pick up the learner reading the suggestions to themselves.
    interrupt();
    setPhase("waiting");
    setNotice("");
    suggestAbortRef.current?.abort();
    const ac = new AbortController();
    suggestAbortRef.current = ac;
    setSuggest({ forId: last.id, status: "loading" });
    try {
      const { suggestions } = await postJSON<{ suggestions: ReplySuggestion[] }>(
        "/api/chat/suggest",
        { ...requestBase(), history: toHistory(turnsRef.current) },
        ac.signal,
      );
      if (aliveRef.current && !ac.signal.aborted) setSuggest({ forId: last.id, status: "done", items: suggestions });
    } catch (err) {
      if (!aliveRef.current || ac.signal.aborted) return;
      setSuggest({ forId: last.id, status: "error", code: err instanceof AiRequestError ? err.code : "network" });
    }
  };

  const toggleTranslation = async (turn: UiTurn) => {
    if (turn.translation && turn.translation.status !== "error") {
      updateTurn(turn.id, { showTranslation: !turn.showTranslation });
      return;
    }
    updateTurn(turn.id, { translation: { status: "loading" }, showTranslation: true });
    let next: TranslationState;
    try {
      const { vi } = await postJSON<{ vi: string }>("/api/chat/translate", { text: turn.text });
      next = { status: "done", text: vi };
    } catch (err) {
      next = { status: "error", code: err instanceof AiRequestError ? err.code : "network" };
    }
    if (aliveRef.current) updateTurn(turn.id, { translation: next });
  };

  /* ---------- End of session: summary + save as script ---------- */

  const router = useRouter();
  const [summary, setSummary] = useState<SummaryState>(
    initial?.summary ? { status: "done", data: initial.summary } : { status: "loading" },
  );
  // Number of turns the summary / saved script were made from, so they refresh after "continue".
  const summaryForRef = useRef(initial?.summary ? initial.turns.length : -1);
  const summaryAbortRef = useRef<AbortController | null>(null);
  const [savedScript, setSavedScript] = useState<{ script: SavedScript; turnCount: number } | null>(null);

  const doneTurns = () => turnsRef.current.filter((t) => !t.streaming && t.text);
  const correctionsOf = (list: UiTurn[]): Correction[] =>
    list.flatMap((t) =>
      t.role === "user" && t.feedback?.status === "done" && t.feedback.data.verdict !== "good"
        ? [{ original: t.text, corrected: t.feedback.data.corrected, explanation: t.feedback.data.explanation }]
        : [],
    );

  const fetchSummary = async () => {
    const list = doneTurns();
    summaryAbortRef.current?.abort();
    const ac = new AbortController();
    summaryAbortRef.current = ac;
    summaryForRef.current = list.length;
    setSummary({ status: "loading" });
    try {
      const data = await postJSON<ChatSummary>(
        "/api/chat/summary",
        {
          ...requestBase(),
          history: toHistory(list),
          corrections: correctionsOf(list),
          goalsDone: completedGoals(toSaved(list), missionRef.current),
        },
        ac.signal,
      );
      if (aliveRef.current && !ac.signal.aborted) setSummary({ status: "done", data });
    } catch (err) {
      if (ac.signal.aborted || !aliveRef.current) return;
      summaryForRef.current = -1;
      setSummary({ status: "error", code: err instanceof AiRequestError ? err.code : "network" });
    }
  };

  const fetchSummaryRef = useRef(fetchSummary);
  fetchSummaryRef.current = fetchSummary;

  const endSession = () => {
    if (!turnsRef.current.some((t) => t.role === "user")) {
      onExit(); // nothing said yet: nothing to summarise
      return;
    }
    interrupt();
    setPhase("summary");
    window.scrollTo({ top: 0 });
    if (summaryForRef.current !== doneTurns().length) void fetchSummary();
  };

  const continueChat = () => {
    summaryAbortRef.current?.abort();
    if (summary.status === "loading") summaryForRef.current = -1;
    resume();
  };

  const [savingScript, setSavingScript] = useState(false);
  const saveAsScript = async () => {
    if (savingScript) return;
    const list = doneTurns();
    const corrected = new Map(correctionsOf(list).map((c) => [c.original, c.corrected]));
    const title = `${topicLabel} · ${new Date().toLocaleDateString("vi-VN")}`;
    const raw = chatToScript(
      list.map((t) => ({ role: t.role, text: t.text, corrected: t.role === "user" ? corrected.get(t.text) : undefined })),
      title,
    );
    setSavingScript(true);
    try {
      const script = await createScript(title, raw);
      if (!aliveRef.current) return;
      setSavedScript({ script, turnCount: list.length });
      toast.success("Đã lưu thành kịch bản", {
        description: "Xem trong thư viện của chế độ Luyện theo kịch bản.",
        action: { label: "Luyện ngay", onClick: () => practiceScript(script) },
      });
    } catch (err) {
      toast.error("Chưa lưu được kịch bản", {
        description: aiErrorText(err instanceof AiRequestError ? err.code : "network"),
      });
    } finally {
      if (aliveRef.current) setSavingScript(false);
    }
  };

  const practiceScript = (script: SavedScript) => {
    router.push(queueScriptForPractice(script, CHAT_SCRIPT_ME));
  };

  const playOnce = (text: string) => {
    stopSpeaking();
    void speak(text, speechOpts);
  };

  /* ---------- History: the conversation is saved as it goes (collection `chats`) ---------- */

  const [saveError, setSaveError] = useState<string | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const pendingSaveRef = useRef<ChatSessionInput | null>(null);
  const saveOffRef = useRef(false);
  const sessionIdRef = useRef(sessionId);

  const sessionInput = (): ChatSessionInput | null => {
    const saved = toSaved(turns);
    if (!saved.some((t) => t.role === "user")) return null;
    const summaryIsCurrent = summary.status === "done" && summaryForRef.current === saved.length;
    return {
      topicId: settings.topicId,
      ...(settings.topicId === CUSTOM_TOPIC_ID && settings.customTopic ? { customTopic: settings.customTopic } : {}),
      level: settings.level,
      topicLabel,
      ...(mission ? { mission } : {}),
      turns: saved,
      ...(summaryIsCurrent ? { summary: summary.data } : {}),
    };
  };

  // Debounced save after every change. Runs each render; the JSON key skips unchanged sessions.
  useEffect(() => {
    if (saveOffRef.current) return;
    const input = sessionInput();
    if (!input) return;
    const key = JSON.stringify(input);
    // A reopened conversation is already saved: only save once something changes.
    if (lastSavedRef.current === null && initial) lastSavedRef.current = key;
    if (key === lastSavedRef.current) return;
    pendingSaveRef.current = input;
    const timer = setTimeout(() => {
      pendingSaveRef.current = null;
      saveChat(sessionIdRef.current, input)
        .then(() => {
          lastSavedRef.current = key;
          if (aliveRef.current) setSaveError(null);
        })
        .catch((err) => {
          const code = err instanceof AiRequestError ? err.code : "network";
          if (code === "db_not_configured") saveOffRef.current = true;
          if (aliveRef.current) setSaveError(code);
        });
    }, 1500);
    return () => clearTimeout(timer);
  });

  // Flush a pending save when the tab is closed or the conversation is left.
  useEffect(() => {
    const flush = () => {
      const input = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (input) saveChatOnExit(sessionIdRef.current, input);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  /** Start a new conversation, with a mission first when that option is on. */
  const start = async (run: number) => {
    if (!settings.mission) return void actions.current.askAI();
    setMissionLoading(true);
    // A newer mount (React StrictMode runs effects twice in dev) owns the conversation now.
    const stale = () => !aliveRef.current || mountRef.current !== run;
    try {
      const m = await postJSON<Mission>("/api/chat/mission", {
        topicId: settings.topicId,
        customTopic: settings.customTopic,
        level: settings.level,
      });
      if (stale()) return;
      missionRef.current = m;
      setMission(m);
    } catch (err) {
      if (stale()) return;
      toast.error("Chưa soạn được nhiệm vụ, bắt đầu trò chuyện bình thường", {
        description: aiErrorText(err instanceof AiRequestError ? err.code : "network"),
      });
    }
    setMissionLoading(false);
    void actions.current.askAI();
  };
  const mountRef = useRef(0);
  const reopenedRef = useRef(Boolean(initial));
  const startRef = useRef(start);
  startRef.current = start;

  // Open the conversation on mount (a reopened one starts on its summary); stop everything on unmount.
  useEffect(() => {
    aliveRef.current = true;
    const run = ++mountRef.current;
    if (!reopenedRef.current) void startRef.current(run);
    else if (summaryForRef.current < 0) void fetchSummaryRef.current();
    const feedbacks = feedbackAborts.current;
    return () => {
      aliveRef.current = false;
      // tokenRef is a plain counter (not a DOM ref): bumping it invalidates pending callbacks.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      tokenRef.current++;
      recRef.current?.abort();
      replyAbortRef.current?.abort();
      summaryAbortRef.current?.abort();
      suggestAbortRef.current?.abort();
      feedbacks.forEach((ac) => ac.abort());
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (phase === "summary") return;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }, [turns, interim, phase]);

  // Keyboard: Space = mic / stop, Esc = pause (ignored while typing).
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.code === "Space" && (phase === "listening" || phase === "waiting")) {
      e.preventDefault();
      toggleMic();
    } else if (e.code === "KeyH" && myTurn && !showSuggest && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      void fetchSuggestions();
    } else if (e.code === "Escape" && phase !== "paused" && phase !== "summary") {
      pause();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const topicLabel =
    settings.topicId === CUSTOM_TOPIC_ID
      ? settings.customTopic || "Chủ đề tự chọn"
      : (TOPICS.find((t) => t.id === settings.topicId)?.label ?? "Trò chuyện");
  const levelLabel = LEVELS.find((l) => l.id === settings.level)?.label;

  if (phase === "summary") {
    const list = turns.filter((t) => !t.streaming && t.text);
    const userTurns = list.filter((t) => t.role === "user");
    const corrections = correctionsOf(list);
    const good = userTurns.filter((t) => t.feedback?.status === "done" && t.feedback.data.verdict === "good").length;
    return (
      <SessionSummary
        topicLabel={topicLabel}
        stats={{ userTurns: userTurns.length, good, needsWork: corrections.length }}
        corrections={corrections}
        mission={mission}
        goalsDone={goalsDone}
        transcript={toHistory(list)}
        summary={summary}
        saved={savedScript?.turnCount === list.length}
        onRetrySummary={() => void fetchSummary()}
        onSaveScript={() => void saveAsScript()}
        saving={savingScript}
        onPracticeScript={() => savedScript && practiceScript(savedScript.script)}
        onContinue={continueChat}
        onNewSession={onExit}
        onPlay={playOnce}
        onAddPhrase={async (item) => {
          try {
            await addPhrases([item]);
            return true;
          } catch (err) {
            toast.error("Chưa lưu được vào sổ tay", {
              description: aiErrorText(err instanceof AiRequestError ? err.code : "network"),
            });
            return false;
          }
        }}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-4">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{topicLabel}</p>
            <p className="text-xs text-muted-foreground">
              {levelLabel}
              {saveError && (
                <span className="text-amber-600 dark:text-amber-400" title={aiErrorText(saveError)}>
                  {levelLabel ? " · " : ""}Chưa lưu được vào lịch sử
                </span>
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={endSession}>
            <LogOutIcon /> Kết thúc
          </Button>
        </div>

        <div className="flex flex-1 flex-col gap-4 pb-6">
          {missionLoading && <MissionLoading />}
          {mission && <MissionCard mission={mission} done={goalsDone} />}
          {turns.map((turn) =>
            turn.role === "assistant" ? (
              <div key={turn.id} className="flex max-w-[85%] flex-col items-start gap-1">
                <span className="px-1 text-xs font-medium text-muted-foreground">AI</span>
                <div
                  className={cn(
                    "rounded-2xl rounded-tl-sm border bg-card px-4 py-3 shadow-xs",
                    turn.id === lastTurn?.id && phase === "speaking" && "ring-2 ring-primary/40",
                  )}
                >
                  {turn.text ? (
                    <p className="leading-relaxed">{turn.text}</p>
                  ) : (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Loader2Icon className="size-4 animate-spin" /> Đang nghĩ…
                    </p>
                  )}
                  {turn.showTranslation && turn.translation && (
                    <p className="mt-2 border-t pt-2 text-sm text-muted-foreground">
                      {turn.translation.status === "loading" ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2Icon className="size-3.5 animate-spin" /> Đang dịch…
                        </span>
                      ) : turn.translation.status === "done" ? (
                        turn.translation.text
                      ) : (
                        `Chưa dịch được. ${aiErrorText(turn.translation.code)}`
                      )}
                    </p>
                  )}
                  {!turn.streaming && (
                    <div className="-ml-2 mt-1 flex flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-muted-foreground"
                        onClick={() => replay(turn.text)}
                        disabled={replying}
                      >
                        <Volume2Icon
                          className={cn(
                            turn.id === lastTurn?.id && phase === "speaking" && "animate-pulse text-primary",
                          )}
                        />
                        Nghe lại
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-muted-foreground"
                        onClick={() => void toggleTranslation(turn)}
                        disabled={turn.translation?.status === "loading"}
                        aria-pressed={!!turn.showTranslation}
                      >
                        <LanguagesIcon />
                        {turn.showTranslation && turn.translation?.status === "done" ? "Ẩn bản dịch" : "Dịch"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div key={turn.id} className="flex max-w-[85%] flex-col items-end gap-1.5 self-end">
                <span className="px-1 text-xs font-medium text-muted-foreground">Bạn</span>
                <div className="rounded-2xl rounded-tr-sm border border-primary/20 bg-accent px-4 py-3 text-accent-foreground">
                  <p className="leading-relaxed">{turn.text}</p>
                </div>
                <FeedbackView feedback={turn.feedback} onPlay={replay} canPlay={!replying} />
                {turn.inPhrasebook && (
                  <p className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
                    <NotebookPenIcon className="size-3" /> Đã lưu vào sổ tay câu
                  </p>
                )}
              </div>
            ),
          )}

          {phase === "listening" && (
            <p className="self-end px-1 text-sm text-muted-foreground italic">
              {interim ? `“${interim}”` : "Đang nghe…"}
            </p>
          )}

          {phase === "error" && errorCode && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center text-sm">
              <p className="flex items-center gap-1.5 text-destructive">
                <TriangleAlertIcon className="size-4 shrink-0" /> {aiErrorText(errorCode)}
              </p>
              <Button size="sm" variant="outline" onClick={() => void askAI()}>
                <RotateCcwIcon /> Thử lại
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Control bar */}
      <div className="sticky bottom-0 z-10 border-t bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-4">
          {mission && <MissionProgress mission={mission} done={goalsDone} />}

          {notice && (
            <p className="flex items-center justify-center gap-1.5 text-center text-sm text-amber-600 dark:text-amber-400">
              <TriangleAlertIcon className="size-4 shrink-0" /> {notice}
            </p>
          )}

          {showSuggest && suggest && (
            <div className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <SparklesIcon className="size-3.5" /> Bạn có thể nói…
              </p>
              {suggest.status === "loading" ? (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" /> Đang nghĩ gợi ý…
                </p>
              ) : suggest.status === "error" ? (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <span>{aiErrorText(suggest.code)}</span>
                  <Button size="xs" variant="outline" onClick={() => void fetchSuggestions()}>
                    <RotateCcwIcon /> Thử lại
                  </Button>
                </div>
              ) : (
                suggest.items.map((s) => (
                  <button
                    key={s.text}
                    type="button"
                    onClick={() => replay(s.text)}
                    disabled={replying}
                    className="flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    <Volume2Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{s.text}</span>
                      <span className="block text-xs text-muted-foreground">{s.vi}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (myTurn) submitUser(typed);
            }}
          >
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={!myTurn}
              placeholder={
                myTurn
                  ? recSupported
                    ? "…hoặc gõ câu trả lời rồi Enter"
                    : "Gõ câu trả lời rồi Enter"
                  : phase === "thinking"
                    ? "AI đang trả lời…"
                    : "Đợi đến lượt bạn"
              }
            />
          </form>

          <div className="flex items-center justify-center gap-2">
            {phase === "paused" ? (
              <Button size="lg" onClick={resume}>
                <PlayIcon /> Tiếp tục
              </Button>
            ) : (
              <>
                <Hint label="Tạm dừng (Esc)">
                  <Button variant="outline" size="icon-lg" onClick={pause} aria-label="Tạm dừng">
                    <PauseIcon />
                  </Button>
                </Hint>
                {recSupported && (
                  <Hint label={phase === "listening" ? "Dừng (Space)" : "Nói (Space)"}>
                    <Button
                      onClick={toggleMic}
                      disabled={phase !== "listening" && phase !== "waiting"}
                      aria-label={phase === "listening" ? "Dừng nghe" : "Bật mic"}
                      className={cn(
                        "size-14 rounded-full shadow-lg [&_svg:not([class*='size-'])]:size-6",
                        phase === "listening" && "animate-pulse bg-destructive text-white hover:bg-destructive/90",
                      )}
                    >
                      {phase === "listening" ? <SquareIcon className="fill-current" /> : <MicIcon />}
                    </Button>
                  </Hint>
                )}
                <Hint label="Gợi ý trả lời (H)">
                  <Button
                    variant="outline"
                    size="icon-lg"
                    onClick={() => void fetchSuggestions()}
                    disabled={!myTurn || showSuggest}
                    aria-label="Gợi ý trả lời"
                  >
                    <LightbulbIcon />
                  </Button>
                </Hint>
              </>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Space: nói / dừng · H: gợi ý · Esc: tạm dừng
          </p>
        </div>
      </div>
    </div>
  );
}

function FeedbackView({
  feedback,
  onPlay,
  canPlay,
}: {
  feedback: FeedbackState | undefined;
  onPlay: (text: string) => void;
  canPlay: boolean;
}) {
  if (!feedback) return null;
  if (feedback.status === "loading") {
    return (
      <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" /> Đang xem lại câu của bạn…
      </p>
    );
  }
  if (feedback.status === "error") {
    return <p className="px-1 text-xs text-muted-foreground">Không lấy được góp ý cho câu này.</p>;
  }
  const { verdict, corrected, explanation } = feedback.data;
  if (verdict === "good") {
    return (
      <Badge className="bg-success/15 text-success">
        <CheckCircle2Icon /> Tự nhiên rồi
      </Badge>
    );
  }
  return (
    <div
      className={cn(
        "w-full max-w-md rounded-xl border px-3 py-2.5 text-sm",
        verdict === "fix" ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-muted/50",
      )}
    >
      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <LightbulbIcon className="size-3.5" /> {verdict === "fix" ? "Nên sửa" : "Có thể nói tự nhiên hơn"}
      </p>
      <p className="font-medium">{corrected}</p>
      {explanation && <p className="mt-1 text-xs text-muted-foreground">{explanation}</p>}
      <Button
        variant="ghost"
        size="xs"
        className="-ml-2 mt-1 text-muted-foreground"
        onClick={() => onPlay(corrected)}
        disabled={!canPlay}
      >
        <Volume2Icon /> Nghe câu gợi ý
      </Button>
    </div>
  );
}

function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
