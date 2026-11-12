"use client";

import {
  CheckCircle2Icon,
  LightbulbIcon,
  Loader2Icon,
  LogOutIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SquareIcon,
  TriangleAlertIcon,
  Volume2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { aiErrorText, AiRequestError, readAiError } from "@/lib/ai-errors";
import { LEVELS, TOPICS, CUSTOM_TOPIC_ID, type ChatRole, type ChatTurn, type Feedback } from "@/lib/chat/prompts";
import { speak, startListening, stopSpeaking, type ListenController } from "@/lib/speech";
import { cn } from "@/lib/utils";
import type { ChatSettings } from "./ChatPractice";

type FeedbackState = { status: "loading" } | { status: "done"; data: Feedback } | { status: "error" };
type UiTurn = { id: number; role: ChatRole; text: string; streaming?: boolean; feedback?: FeedbackState };
type Phase = "thinking" | "speaking" | "listening" | "waiting" | "paused" | "error";

const toHistory = (turns: UiTurn[]): ChatTurn[] =>
  turns.filter((t) => !t.streaming && t.text).map((t) => ({ role: t.role, text: t.text }));

type Props = {
  settings: ChatSettings;
  voiceURI: string | undefined;
  recSupported: boolean;
  onExit: () => void;
};

export default function Conversation({ settings, voiceURI, recSupported, onExit }: Props) {
  const [turns, setTurns] = useState<UiTurn[]>([]);
  const [phase, setPhase] = useState<Phase>("thinking");
  const [interim, setInterim] = useState("");
  const [notice, setNotice] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  // turnsRef mirrors state so async callbacks always see the latest list.
  const turnsRef = useRef<UiTurn[]>([]);
  const idRef = useRef(0);
  const tokenRef = useRef(0);
  const recRef = useRef<ListenController | null>(null);
  const replyAbortRef = useRef<AbortController | null>(null);
  const feedbackAborts = useRef(new Set<AbortController>());
  const aliveRef = useRef(true);

  const commit = (next: UiTurn[]) => {
    turnsRef.current = next;
    setTurns(next);
  };
  const updateTurn = (id: number, patch: Partial<UiTurn>) =>
    commit(turnsRef.current.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const speechOpts = { voiceURI, rate: settings.rate };
  const requestBase = { topicId: settings.topicId, customTopic: settings.customTopic, level: settings.level };

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
    setNotice("");
    setErrorCode(null);
    const history = toHistory(turnsRef.current);
    const id = ++idRef.current;
    commit([...turnsRef.current, { id, role: "assistant", text: "", streaming: true }]);
    setPhase("thinking");

    const ac = new AbortController();
    replyAbortRef.current = ac;
    let text = "";
    try {
      const res = await fetch("/api/chat/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestBase, history }),
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
      }
      text = (text + decoder.decode()).trim();
      if (!text) throw new AiRequestError("upstream_error");
    } catch (err) {
      if (tokenRef.current !== token) return; // cancelled on purpose
      commit(turnsRef.current.filter((t) => t.id !== id));
      setErrorCode(err instanceof AiRequestError ? err.code : "network");
      setPhase("error");
      return;
    }
    if (tokenRef.current !== token) return;
    replyAbortRef.current = null;
    updateTurn(id, { text, streaming: false });
    setPhase("speaking");
    speak(text, speechOpts).then(() => {
      if (tokenRef.current === token) listen(token);
    });
  };

  const requestFeedback = async (id: number, history: ChatTurn[], utterance: string) => {
    const ac = new AbortController();
    feedbackAborts.current.add(ac);
    let next: FeedbackState;
    try {
      const res = await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: settings.level, history, utterance }),
        signal: ac.signal,
      });
      next = res.ok ? { status: "done", data: (await res.json()) as Feedback } : { status: "error" };
    } catch {
      next = { status: "error" };
    } finally {
      feedbackAborts.current.delete(ac);
    }
    if (aliveRef.current) updateTurn(id, { feedback: next });
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
  const myTurn = lastTurn?.role === "assistant" && !lastTurn.streaming && (phase === "listening" || phase === "waiting");

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
    if (phase === "thinking") return;
    const stay = phase === "paused" || phase === "error";
    const token = interrupt();
    if (!stay) setPhase("speaking");
    speak(text, speechOpts).then(() => {
      if (tokenRef.current === token && !stay) listen(token);
    });
  };

  // Open the conversation on mount; stop everything on unmount.
  useEffect(() => {
    aliveRef.current = true;
    void actions.current.askAI();
    const feedbacks = feedbackAborts.current;
    return () => {
      aliveRef.current = false;
      // tokenRef is a plain counter (not a DOM ref): bumping it invalidates pending callbacks.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      tokenRef.current++;
      recRef.current?.abort();
      replyAbortRef.current?.abort();
      feedbacks.forEach((ac) => ac.abort());
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
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
    } else if (e.code === "Escape" && phase !== "paused") {
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

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-4">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{topicLabel}</p>
            {levelLabel && <p className="text-xs text-muted-foreground">{levelLabel}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={onExit}>
            <LogOutIcon /> Kết thúc
          </Button>
        </div>

        <div className="flex flex-1 flex-col gap-4 pb-6">
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
                  {!turn.streaming && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="-ml-2 mt-1 text-muted-foreground"
                      onClick={() => replay(turn.text)}
                      disabled={phase === "thinking"}
                    >
                      <Volume2Icon
                        className={cn(turn.id === lastTurn?.id && phase === "speaking" && "animate-pulse text-primary")}
                      />
                      Nghe lại
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div key={turn.id} className="flex max-w-[85%] flex-col items-end gap-1.5 self-end">
                <span className="px-1 text-xs font-medium text-muted-foreground">Bạn</span>
                <div className="rounded-2xl rounded-tr-sm border border-primary/20 bg-accent px-4 py-3 text-accent-foreground">
                  <p className="leading-relaxed">{turn.text}</p>
                </div>
                <FeedbackView feedback={turn.feedback} onPlay={replay} canPlay={phase !== "thinking"} />
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
          {notice && (
            <p className="flex items-center justify-center gap-1.5 text-center text-sm text-amber-600 dark:text-amber-400">
              <TriangleAlertIcon className="size-4 shrink-0" /> {notice}
            </p>
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
                <div className="w-10" aria-hidden />
              </>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground">Space: nói / dừng · Esc: tạm dừng</p>
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
