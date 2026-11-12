"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  MicIcon,
  RotateCcwIcon,
  SquareIcon,
  TriangleAlertIcon,
  Volume2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { REVIEW_PASS_SCORE, type Phrase } from "@/lib/phrasebook";
import { reviewPhrase } from "@/lib/phrases-client";
import { compareLine, hintText, type Comparison } from "@/lib/script";
import { speak, startListening, stopSpeaking, type ListenController } from "@/lib/speech";
import { cn } from "@/lib/utils";

type Phase = "speaking" | "listening" | "waiting" | "result" | "done";
type Attempt = Comparison & { spoken: string };

type Props = {
  queue: Phrase[];
  voiceURI: string | undefined;
  rate: number;
  recSupported: boolean;
  /** Called after a phrase's first attempt is recorded, with its new schedule. */
  onReviewed: (phrase: Phrase) => void;
  onExit: () => void;
};

export default function PhraseReview({ queue: initialQueue, voiceURI, rate, recSupported, onReviewed, onExit }: Props) {
  const [queue, setQueue] = useState(initialQueue);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("speaking");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [interim, setInterim] = useState("");
  const [notice, setNotice] = useState("");
  const [typed, setTyped] = useState("");
  const [hideText, setHideText] = useState(false);
  // First-attempt score per phrase id: only that one moves the review schedule.
  const [firstScores, setFirstScores] = useState<Record<string, number>>({});
  // Bumped to start another round (extra practice of failed phrases) after the queue updates.
  const [round, setRound] = useState(0);

  const tokenRef = useRef(0);
  const recRef = useRef<ListenController | null>(null);
  // Phrases whose result was already sent this session; extra practice rounds never re-send.
  const recordedRef = useRef(new Set<string>());
  const actions = useRef<{ run: (i: number) => void }>({ run: () => {} });
  const phrase = queue[idx];

  const interrupt = () => {
    tokenRef.current++;
    recRef.current?.abort();
    recRef.current = null;
    stopSpeaking();
    return tokenRef.current;
  };

  const record = (p: Phrase, cmp: Comparison) => {
    if (p.id in firstScores) return; // only the first attempt in a round counts
    setFirstScores((s) => ({ ...s, [p.id]: cmp.score }));
    if (recordedRef.current.has(p.id)) return; // already scheduled earlier this session
    recordedRef.current.add(p.id);
    const passed = cmp.score >= REVIEW_PASS_SCORE;
    reviewPhrase(p.id, cmp.score, passed)
      .then(onReviewed)
      .catch(() => setNotice("Chưa lưu được kết quả ôn tập lên server. Kết quả lần này sẽ không được tính."));
  };

  const submit = (i: number, spoken: string, token: number) => {
    const p = queue[i];
    const cmp = compareLine(p.text, spoken);
    setAttempt({ ...cmp, spoken });
    setPhase("result");
    record(p, cmp);
    if (cmp.score >= REVIEW_PASS_SCORE) {
      setTimeout(() => {
        if (tokenRef.current === token) actions.current.run(i + 1);
      }, 1300);
    }
  };

  const listen = (i: number, token: number) => {
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

  const run = (i: number) => {
    const token = interrupt();
    setAttempt(null);
    setNotice("");
    setTyped("");
    if (i >= queue.length) {
      setIdx(queue.length);
      setPhase("done");
      return;
    }
    setIdx(i);
    setPhase("speaking");
    speak(queue[i].text, { voiceURI, rate }).then(() => {
      if (tokenRef.current === token) listen(i, token);
    });
  };
  actions.current.run = run;

  const replay = () => {
    if (!phrase) return;
    const wasResult = phase === "result";
    const token = interrupt();
    setPhase("speaking");
    speak(phrase.text, { voiceURI, rate }).then(() => {
      if (tokenRef.current !== token) return;
      if (wasResult) setPhase("result");
      else listen(idx, token);
    });
  };
  const retry = () => listen(idx, interrupt());
  const next = () => run(idx + 1);

  useEffect(() => {
    actions.current.run(0);
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- plain counter, not a DOM ref
      tokenRef.current++;
      recRef.current?.abort();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (round > 0) actions.current.run(0);
  }, [round]);

  // Keyboard: Space = mic / stop, Enter = next (ignored while typing).
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.code === "Space" && (phase === "listening" || phase === "waiting" || phase === "result")) {
      e.preventDefault();
      if (phase === "listening") recRef.current?.stop();
      else retry();
    } else if (e.code === "Enter" && (phase === "result" || phase === "waiting")) {
      e.preventDefault();
      next();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const scores = Object.values(firstScores);
  const passedCount = scores.filter((s) => s >= REVIEW_PASS_SCORE).length;
  const failed = queue.filter((p) => p.id in firstScores && firstScores[p.id] < REVIEW_PASS_SCORE);

  if (phase === "done") {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-10">
        <Card className="text-center">
          <CardHeader>
            <CardDescription>Xong buổi ôn tập</CardDescription>
            <CardTitle className="text-4xl font-semibold tabular-nums">
              {passedCount}/{scores.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {scores.length === 0
              ? "Bạn chưa nói câu nào trong buổi này."
              : failed.length
                ? `Câu đạt sẽ được nhắc lại sau vài ngày. ${failed.length} câu chưa đạt sẽ có trong lần ôn tới.`
                : "Tất cả đều đạt! Các câu sẽ được nhắc lại sau vài ngày để bạn nhớ lâu."}
          </CardContent>
          <CardFooter className="flex-wrap justify-center gap-3">
            {failed.length > 0 && (
              <Button
                onClick={() => {
                  // These were already recorded as failed (due again next time); this round is extra practice.
                  setQueue(failed);
                  setFirstScores({});
                  setRound((r) => r + 1); // the effect below starts it once the new queue is rendered
                }}
              >
                <RotateCcwIcon /> Luyện thêm {failed.length} câu chưa đạt
              </Button>
            )}
            <Button variant="outline" onClick={onExit}>
              Về sổ tay
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!phrase) return null;
  const showText = !hideText || phase === "result";

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onExit}>
            <ArrowLeftIcon /> Sổ tay
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setHideText((v) => !v)} aria-pressed={hideText}>
            {hideText ? <EyeIcon /> : <EyeOffIcon />} {hideText ? "Hiện chữ" : "Che chữ (chỉ nghe)"}
          </Button>
          <Badge variant="secondary" className="tabular-nums">
            {idx + 1}/{queue.length}
          </Badge>
        </div>
        <Progress value={(idx / queue.length) * 100} className="mb-8 h-1" />

        <Card className="mb-6">
          <CardContent className="flex flex-col gap-4">
            {attempt ? (
              <p className="text-xl leading-relaxed font-medium">
                {attempt.words.map((w, k) => (
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
            ) : (
              <p className="text-xl leading-relaxed font-medium">{showText ? phrase.text : hintText(phrase.text)}</p>
            )}
            {(phrase.original || phrase.note) && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                {phrase.original && (
                  <p className="text-muted-foreground line-through decoration-destructive/50">{phrase.original}</p>
                )}
                {phrase.note && <p className="mt-0.5 text-muted-foreground">{phrase.note}</p>}
              </div>
            )}
            {attempt && (
              <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
                <span className="text-muted-foreground italic">Bạn nói: “{attempt.spoken}”</span>
                <Badge
                  className={cn(
                    "tabular-nums",
                    attempt.score >= REVIEW_PASS_SCORE
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive",
                  )}
                >
                  {attempt.score}%
                </Badge>
              </div>
            )}
            {phase === "listening" && (
              <p className="text-sm text-muted-foreground italic">{interim ? `“${interim}”` : "Đang nghe…"}</p>
            )}
            {phase === "speaking" && <p className="text-sm text-muted-foreground">🔊 Nghe mẫu…</p>}
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-0 z-10 border-t bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-4">
          {notice && (
            <p className="flex items-center justify-center gap-1.5 text-center text-sm text-amber-600 dark:text-amber-400">
              <TriangleAlertIcon className="size-4 shrink-0" /> {notice}
            </p>
          )}
          {!recSupported && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim()) submit(idx, typed.trim(), interrupt());
              }}
            >
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Gõ lại câu rồi Enter" />
            </form>
          )}
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="lg" onClick={replay}>
              <Volume2Icon /> Nghe mẫu
            </Button>
            {recSupported && (
              <Button
                onClick={() => (phase === "listening" ? recRef.current?.stop() : retry())}
                disabled={phase === "speaking"}
                aria-label={phase === "listening" ? "Dừng nghe" : "Bật mic"}
                className={cn(
                  "size-14 rounded-full shadow-lg [&_svg:not([class*='size-'])]:size-6",
                  phase === "listening" && "animate-pulse bg-destructive text-white hover:bg-destructive/90",
                )}
              >
                {phase === "listening" ? <SquareIcon className="fill-current" /> : <MicIcon />}
              </Button>
            )}
            <Button variant="outline" size="lg" onClick={next}>
              {attempt ? "Tiếp" : "Bỏ qua"} <ArrowRightIcon />
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Space: nói / dừng · Enter: câu tiếp · Đạt từ {REVIEW_PASS_SCORE}%
          </p>
        </div>
      </div>
    </div>
  );
}
