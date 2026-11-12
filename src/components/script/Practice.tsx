"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EyeIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SkipForwardIcon,
  SquareIcon,
  TargetIcon,
  TriangleAlertIcon,
  Volume2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { failedLineIndexes } from "@/lib/practice";
import { cleanForSpeech, compareLine, hintText, type Comparison, type ParsedScript } from "@/lib/script";
import type { LineMode, Settings } from "@/lib/settings";
import { speak, startListening, stopSpeaking, type ListenController } from "@/lib/speech";
import { cn } from "@/lib/utils";

type Phase = "speaking" | "listening" | "waiting" | "result" | "paused" | "done";
type Scored = Comparison & { spoken: string };
type LineResult = Scored | { skipped: true };

type Props = {
  script: ParsedScript;
  myRoles: string[];
  settings: Settings;
  voiceFor: (speaker: string) => string | undefined;
  recSupported: boolean;
  onExit: () => void;
  /** Start a new session with only these learner lines (indexes into script.lines). */
  onRetryLines?: (lineIndexes: number[]) => void;
};

export default function Practice({
  script,
  myRoles,
  settings,
  voiceFor,
  recSupported,
  onExit,
  onRetryLines,
}: Props) {
  const lines = script.lines;
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("speaking");
  const [interim, setInterim] = useState("");
  const [notice, setNotice] = useState("");
  const [typed, setTyped] = useState("");
  const [results, setResults] = useState<Record<number, LineResult>>({});
  const [peek, setPeek] = useState<Record<number, LineMode>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const tokenRef = useRef(0);
  const recRef = useRef<ListenController | null>(null);
  const isMine = (i: number) => myRoles.includes(lines[i]?.speaker);

  /** Cancel anything in flight and return a fresh token for the next action. */
  const interrupt = () => {
    tokenRef.current++;
    recRef.current?.abort();
    recRef.current = null;
    stopSpeaking();
    return tokenRef.current;
  };

  // Functions below are re-created each render; keep the latest in a ref for async callbacks.
  const actions = useRef<{ runLine: (i: number) => void }>({ runLine: () => {} });

  const submit = (i: number, spoken: string, token: number) => {
    const cmp = compareLine(lines[i].text, spoken);
    setResults((r) => ({ ...r, [i]: { ...cmp, spoken } }));
    setPhase("result");
    if (cmp.score >= settings.threshold && settings.autoAdvance) {
      setTimeout(() => {
        if (tokenRef.current === token) actions.current.runLine(i + 1);
      }, 1100);
    }
  };

  const listen = (i: number, token: number) => {
    setPhase("listening");
    setInterim("");
    setNotice("");
    recRef.current = startListening({
      onInterim: (t) => {
        if (tokenRef.current === token) setInterim(t);
      },
      onDone: (text, error) => {
        if (tokenRef.current !== token) return;
        recRef.current = null;
        if (text) return submit(i, text, token);
        setPhase("waiting");
        setNotice(
          error === "not-allowed" || error === "service-not-allowed"
            ? "Trình duyệt đang chặn micro. Hãy cho phép micro rồi bấm nút mic để thử lại."
            : error === "network"
              ? "Lỗi mạng: nhận giọng nói của Chrome cần có Internet."
              : "Chưa nghe thấy gì. Bấm nút mic (hoặc phím Space) để nói lại.",
        );
      },
    });
  };

  const runLine = (i: number) => {
    const token = interrupt();
    setInterim("");
    setNotice("");
    setTyped("");
    if (i >= lines.length) {
      setIdx(lines.length);
      setPhase("done");
      return;
    }
    setIdx(i);
    const line = lines[i];
    if (!isMine(i)) {
      setPhase("speaking");
      speak(cleanForSpeech(line.text), { voiceURI: voiceFor(line.speaker), rate: settings.rate }).then(() => {
        if (tokenRef.current !== token) return;
        setTimeout(() => {
          if (tokenRef.current === token) actions.current.runLine(i + 1);
        }, 300);
      });
    } else if (recSupported) {
      listen(i, token);
    } else {
      setPhase("waiting");
    }
  };
  actions.current.runLine = runLine;

  const retry = () => listen(idx, interrupt());
  const next = () => runLine(idx + 1);
  const skip = () => {
    setResults((r) => (r[idx] ? r : { ...r, [idx]: { skipped: true } }));
    next();
  };
  const pause = () => {
    interrupt();
    setPhase("paused");
  };
  const restart = () => {
    setResults({});
    setPeek({});
    runLine(0);
  };
  const playLine = (i: number) => {
    // If the machine was mid-line, resume the conversation after the replay.
    const resumeAfter = !isMine(idx) && phase === "speaking";
    const token = interrupt();
    const line = lines[i];
    const voice = voiceFor(line.speaker) ?? voiceFor(script.speakers.find((s) => !myRoles.includes(s)) ?? "");
    speak(cleanForSpeech(line.text), { voiceURI: voice, rate: settings.rate }).then(() => {
      if (tokenRef.current === token && resumeAfter) actions.current.runLine(idx);
    });
    if (isMine(idx) && phase === "listening") setPhase("waiting");
  };
  const submitTyped = () => {
    if (!typed.trim() || !isMine(idx)) return;
    const token = interrupt();
    submit(idx, typed.trim(), token);
  };

  // Start on mount, clean up on unmount.
  useEffect(() => {
    actions.current.runLine(0);
    return () => {
      // tokenRef is a plain counter (not a DOM ref): bumping it invalidates pending callbacks.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      tokenRef.current++;
      recRef.current?.abort();
      stopSpeaking();
    };
  }, []);

  // New lines are appended at the bottom; the control bar is sticky, so scroll the page to the end.
  useEffect(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }, [idx, phase, interim]);

  // Keyboard: Space = mic / stop, Enter = next, Esc = pause.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.code === "Space") {
      if (phase === "listening") {
        e.preventDefault();
        recRef.current?.stop();
      } else if (isMine(idx) && (phase === "waiting" || phase === "result")) {
        e.preventDefault();
        retry();
      }
    } else if (e.code === "Enter") {
      if (phase === "result" || phase === "waiting") {
        e.preventDefault();
        next();
      }
    } else if (e.code === "Escape") {
      if (phase !== "paused" && phase !== "done") pause();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const scored = Object.values(results).filter((r): r is Scored => !("skipped" in r));
  const avg = scored.length ? Math.round(scored.reduce((a, r) => a + r.score, 0) / scored.length) : 0;
  const myTotal = lines.filter((_, i) => isMine(i)).length;
  const failed = phase === "done" ? failedLineIndexes(script, myRoles, results, settings.threshold) : [];
  const current = lines[idx];
  const currentResult = results[idx];
  const myTurn = isMine(idx);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-4">
        {/* Top bar */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onExit}>
            <ArrowLeftIcon /> Kịch bản
          </Button>
          <div className="min-w-0 truncate text-sm font-medium">{script.title || "Hội thoại"}</div>
          <Badge variant="secondary" className="tabular-nums">
            {Math.min(idx + 1, lines.length)}/{lines.length}
          </Badge>
        </div>
        <Progress value={(idx / lines.length) * 100} className="mb-6 h-1" />

        {/* Conversation */}
        <div className="flex flex-1 flex-col gap-4 pb-6">
          {lines.slice(0, Math.min(idx + 1, lines.length)).map((line, i) => {
            const active = i === idx && phase !== "done";
            if (!isMine(i)) {
              const showText = settings.showPartnerText || revealed[i];
              const speaking = active && phase === "speaking";
              return (
                <div key={line.id} className="flex max-w-[85%] flex-col items-start gap-1">
                  <span className="px-1 text-xs font-medium text-muted-foreground">{line.speaker}</span>
                  <div
                    className={cn(
                      "rounded-2xl rounded-tl-sm border bg-card px-4 py-3 shadow-xs",
                      speaking && "ring-2 ring-primary/40",
                    )}
                  >
                    {showText ? (
                      <p className="leading-relaxed">{line.text}</p>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2 text-muted-foreground"
                        onClick={() => setRevealed((r) => ({ ...r, [i]: true }))}
                      >
                        <EyeIcon /> Bấm để xem chữ
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="xs"
                      className="-ml-2 mt-1 text-muted-foreground"
                      onClick={() => playLine(i)}
                    >
                      <Volume2Icon className={cn(speaking && "animate-pulse text-primary")} />
                      {speaking ? "Đang đọc…" : "Nghe lại"}
                    </Button>
                  </div>
                </div>
              );
            }

            const res = results[i];
            const mode: LineMode = res ? "full" : (peek[i] ?? settings.myLineMode);
            return (
              <div key={line.id} className="flex max-w-[85%] flex-col items-end gap-1 self-end">
                <span className="px-1 text-xs font-medium text-muted-foreground">{line.speaker} (bạn)</span>
                <div
                  className={cn(
                    "rounded-2xl rounded-tr-sm border border-primary/20 bg-accent px-4 py-3 text-accent-foreground",
                    active && "ring-2 ring-primary/50",
                  )}
                >
                  {res && !("skipped" in res) ? (
                    <>
                      <p className="leading-relaxed">
                        {res.words.map((w, k) => (
                          <span
                            key={k}
                            className={cn(
                              w.status === "ok" && "text-success",
                              w.status === "miss" &&
                                "rounded bg-destructive/10 text-destructive underline decoration-wavy decoration-destructive/60 underline-offset-4",
                              w.status === "neutral" && "text-muted-foreground",
                            )}
                          >
                            {w.text}{" "}
                          </span>
                        ))}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-3 border-t border-primary/15 pt-2 text-xs">
                        <span className="text-muted-foreground italic">Bạn nói: “{res.spoken}”</span>
                        <Badge
                          className={cn(
                            "tabular-nums",
                            res.score >= settings.threshold
                              ? "bg-success/15 text-success"
                              : "bg-destructive/15 text-destructive",
                          )}
                        >
                          {res.score}%
                        </Badge>
                      </div>
                    </>
                  ) : mode === "hidden" ? (
                    <p className="text-muted-foreground italic">Đến lượt bạn…</p>
                  ) : (
                    <p className="leading-relaxed">{mode === "hint" ? hintText(line.text) : line.text}</p>
                  )}
                  {res && "skipped" in res && <p className="mt-1 text-xs text-muted-foreground">(đã bỏ qua)</p>}
                  {active && !res && mode !== "full" && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="-ml-2 mt-1 text-muted-foreground"
                      onClick={() => setPeek((p) => ({ ...p, [i]: mode === "hidden" ? "hint" : "full" }))}
                    >
                      <EyeIcon /> {mode === "hidden" ? "Xem gợi ý" : "Xem cả câu"}
                    </Button>
                  )}
                </div>
                {active && phase === "listening" && (
                  <p className="px-1 text-sm text-muted-foreground italic">{interim ? `“${interim}”` : "Đang nghe…"}</p>
                )}
              </div>
            );
          })}

          {phase === "done" && (
            <Card className="mt-4 text-center">
              <CardHeader>
                <CardDescription>Hoàn thành hội thoại</CardDescription>
                <CardTitle className="text-5xl font-semibold tabular-nums">{avg}%</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Điểm trung bình trên {scored.length}/{myTotal} câu của bạn.{" "}
                {failed.length > 0
                  ? `Còn ${failed.length} câu chưa đạt ${settings.threshold}%.`
                  : "Tất cả các câu đều đạt!"}
              </CardContent>
              <CardFooter className="flex-wrap justify-center gap-3">
                {failed.length > 0 && onRetryLines && (
                  <Button onClick={() => onRetryLines(failed)}>
                    <TargetIcon /> Luyện lại {failed.length} câu chưa đạt
                  </Button>
                )}
                <Button variant={failed.length > 0 && onRetryLines ? "outline" : "default"} onClick={restart}>
                  <RotateCcwIcon /> Luyện lại cả bài
                </Button>
                <Button variant="outline" onClick={onExit}>
                  Sửa kịch bản
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>
      </div>

      {/* Control bar: sticky inside the content area so it never covers the sidebar */}
      {phase !== "done" && current && (
        <div className="sticky bottom-0 z-10 border-t bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-4">
            {notice && (
              <p className="flex items-center justify-center gap-1.5 text-center text-sm text-amber-600 dark:text-amber-400">
                <TriangleAlertIcon className="size-4 shrink-0" /> {notice}
              </p>
            )}

            {myTurn && phase !== "paused" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitTyped();
                }}
              >
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={recSupported ? "…hoặc gõ câu trả lời rồi Enter" : "Gõ câu trả lời rồi Enter"}
                />
              </form>
            )}

            <div className="flex items-center justify-center gap-2">
              {phase === "paused" ? (
                <Button size="lg" onClick={() => runLine(idx)}>
                  <PlayIcon /> Tiếp tục
                </Button>
              ) : (
                <>
                  <Hint label="Tạm dừng (Esc)">
                    <Button variant="outline" size="icon-lg" onClick={pause} aria-label="Tạm dừng">
                      <PauseIcon />
                    </Button>
                  </Hint>
                  {myTurn && (
                    <Button variant="outline" size="lg" onClick={() => playLine(idx)}>
                      <Volume2Icon /> Nghe mẫu
                    </Button>
                  )}
                  {myTurn && recSupported && (
                    <Hint label={phase === "listening" ? "Dừng (Space)" : "Nói (Space)"}>
                      <Button
                        onClick={() => (phase === "listening" ? recRef.current?.stop() : retry())}
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
                  {myTurn && currentResult ? (
                    <Button variant="outline" size="lg" onClick={next}>
                      Tiếp <ArrowRightIcon />
                    </Button>
                  ) : (
                    <Button variant="outline" size="lg" onClick={myTurn ? skip : next}>
                      Bỏ qua <SkipForwardIcon />
                    </Button>
                  )}
                </>
              )}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Space: nói / dừng · Enter: câu tiếp · Esc: tạm dừng
            </p>
          </div>
        </div>
      )}
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
