"use client";

import {
  ArrowRightIcon,
  BookmarkPlusIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  MessageCircleIcon,
  NotebookPenIcon,
  PlusIcon,
  RotateCcwIcon,
  ScrollTextIcon,
  SparklesIcon,
  TextIcon,
  TimerIcon,
  TriangleAlertIcon,
  Volume2Icon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { aiErrorText } from "@/lib/ai-errors";
import { wordsPerTurn, type ChatSessionStats } from "@/lib/chat/history";
import type { Mission } from "@/lib/chat/mission";
import type { ChatTurn } from "@/lib/chat/prompts";
import type { ChatSummary, Correction } from "@/lib/chat/summary";
import type { NewPhrase } from "@/lib/phrasebook";
import { formatDecimal, formatSeconds } from "@/lib/progress";
import { MissionCard } from "./MissionBar";

export type SummaryState = { status: "loading" } | { status: "done"; data: ChatSummary } | { status: "error"; code: string };

type Props = {
  topicLabel: string;
  stats: ChatSessionStats;
  corrections: Correction[];
  mission: Mission | null;
  goalsDone: number[];
  /** The whole conversation, shown collapsed. */
  transcript: ChatTurn[];
  summary: SummaryState;
  /** True once this exact conversation has been saved as a script. */
  saved: boolean;
  /** Saving to the server is in progress. */
  saving: boolean;
  onRetrySummary: () => void;
  onSaveScript: () => void;
  onPracticeScript: () => void;
  onContinue: () => void;
  onNewSession: () => void;
  onPlay: (text: string) => void;
  /** Save a suggestion to the phrasebook. Resolves true when saved (or already there). */
  onAddPhrase: (item: NewPhrase) => Promise<boolean>;
};

export default function SessionSummary(p: Props) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <div>
        <p className="text-sm text-muted-foreground">{p.topicLabel}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Tổng kết buổi trò chuyện</h1>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Lượt bạn nói" value={p.stats.userTurns} />
        <Stat label="Câu tự nhiên" value={p.stats.good} tone="success" />
        <Stat label="Câu nên sửa" value={p.stats.needsWork} tone={p.stats.needsWork ? "warn" : undefined} />
      </div>

      <FluencyStats stats={p.stats} />

      {p.mission && <MissionCard mission={p.mission} done={p.goalsDone} />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SparklesIcon className="size-4 text-primary" /> Nhận xét của AI
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 text-sm">
          {p.summary.status === "loading" && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" /> Đang xem lại cả buổi trò chuyện…
            </p>
          )}
          {p.summary.status === "error" && (
            <div className="flex flex-col items-start gap-3">
              <p className="flex gap-2 text-destructive">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" /> {aiErrorText(p.summary.code)}
              </p>
              <Button size="sm" variant="outline" onClick={p.onRetrySummary}>
                <RotateCcwIcon /> Thử lại
              </Button>
            </div>
          )}
          {p.summary.status === "done" && (
            <SummaryBody summary={p.summary.data} onPlay={p.onPlay} onAdd={p.onAddPhrase} context={p.topicLabel} />
          )}
        </CardContent>
      </Card>

      {p.corrections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Các câu đã sửa trong buổi</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y text-sm">
              {p.corrections.map((c, i) => (
                <li key={i} className="flex items-start gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-muted-foreground line-through decoration-destructive/50">{c.original}</p>
                    <p className="font-medium">{c.corrected}</p>
                  </div>
                  <PlayButton text={c.corrected} onPlay={p.onPlay} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Transcript turns={p.transcript} onPlay={p.onPlay} />

      <Card className="bg-accent/40">
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>
            <span className="font-medium">Luyện lại cho thuộc?</span>{" "}
            <span className="text-muted-foreground">
              Lưu buổi này thành kịch bản: câu của bạn được thay bằng bản đã sửa, rồi luyện ở chế độ kịch bản.
            </span>
          </p>
          {p.saved ? (
            <Button className="self-start" onClick={p.onPracticeScript}>
              <ScrollTextIcon /> Luyện kịch bản này <ArrowRightIcon />
            </Button>
          ) : (
            <Button className="self-start" onClick={p.onSaveScript} disabled={p.saving}>
              {p.saving ? <Loader2Icon className="animate-spin" /> : <BookmarkPlusIcon />} Lưu thành kịch bản
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={p.onContinue}>
          <MessageCircleIcon /> Trò chuyện tiếp
        </Button>
        <Button variant="outline" onClick={p.onNewSession}>
          <PlusIcon /> Buổi mới
        </Button>
      </div>
    </div>
  );
}

function SummaryBody({
  summary,
  onPlay,
  onAdd,
  context,
}: {
  summary: ChatSummary;
  onPlay: (text: string) => void;
  onAdd: (item: NewPhrase) => Promise<boolean>;
  context: string;
}) {
  return (
    <>
      <p className="leading-relaxed">{summary.overall}</p>

      {summary.strengths.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Làm tốt</h3>
          <ul className="flex flex-col gap-1">
            {summary.strengths.map((s, i) => (
              <li key={i} className="flex gap-2">
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" /> {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.focus.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Nên luyện thêm</h3>
          <ul className="flex flex-col gap-3">
            {summary.focus.map((f, i) => (
              <li key={i} className="rounded-lg border bg-muted/40 p-3">
                <p>{f.issue}</p>
                {f.example && <p className="mt-1.5 text-muted-foreground">Bạn nói: “{f.example}”</p>}
                <div className="mt-1 flex items-center gap-1">
                  <p className="font-medium">Nên nói: “{f.better}”</p>
                  <PlayButton text={f.better} onPlay={onPlay} />
                  <AddButton
                    onAdd={() =>
                      onAdd({ text: f.better, original: f.example || undefined, note: f.issue, source: "chat", context })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.phrases.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Cụm từ nên học
          </h3>
          <ul className="flex flex-col gap-1.5">
            {summary.phrases.map((ph, i) => (
              <li key={i} className="flex items-center gap-1">
                <span className="font-medium">{ph.phrase}</span>
                <span className="text-muted-foreground">: {ph.meaning}</span>
                <PlayButton text={ph.phrase} onPlay={onPlay} />
                <AddButton onAdd={() => onAdd({ text: ph.phrase, note: ph.meaning, source: "chat", context })} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Transcript({ turns, onPlay }: { turns: ChatTurn[]; onPlay: (text: string) => void }) {
  if (!turns.length) return null;
  return (
    <details className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        Xem lại lời thoại ({turns.length} lượt)
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <ol className="flex flex-col gap-2 border-t px-4 py-3 text-sm">
        {turns.map((t, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="w-8 shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">
              {t.role === "assistant" ? "AI" : "Bạn"}
            </span>
            <p className="min-w-0 flex-1">{t.text}</p>
            <PlayButton text={t.text} onPlay={onPlay} />
          </li>
        ))}
      </ol>
    </details>
  );
}

function AddButton({ onAdd }: { onAdd: () => Promise<boolean> }) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="shrink-0 text-muted-foreground"
      aria-label={state === "saved" ? "Đã lưu vào sổ tay" : "Lưu vào sổ tay câu"}
      title={state === "saved" ? "Đã lưu vào sổ tay" : "Lưu vào sổ tay câu"}
      disabled={state !== "idle"}
      onClick={async () => {
        setState("saving");
        setState((await onAdd()) ? "saved" : "idle");
      }}
    >
      {state === "saving" ? (
        <Loader2Icon className="animate-spin" />
      ) : state === "saved" ? (
        <CheckIcon className="text-success" />
      ) : (
        <NotebookPenIcon />
      )}
    </Button>
  );
}

function PlayButton({ text, onPlay }: { text: string; onPlay: (text: string) => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="shrink-0 text-muted-foreground"
      aria-label={`Nghe: ${text}`}
      onClick={() => onPlay(text)}
    >
      <Volume2Icon />
    </Button>
  );
}

/** Reaction time and answer length: how spontaneously and how fully the learner spoke. */
function FluencyStats({ stats }: { stats: ChatSessionStats }) {
  const words = wordsPerTurn(stats);
  if (words === null && stats.responseMs === undefined) return null;
  return (
    <Card size="sm">
      <CardContent className="grid grid-cols-2 gap-4 text-sm">
        <div className="flex flex-col gap-0.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TimerIcon className="size-3.5" /> Thời gian phản hồi
          </p>
          <p className="text-xl font-semibold tabular-nums">
            {stats.responseMs === undefined ? "—" : formatSeconds(stats.responseMs)}
          </p>
          <p className="text-xs text-muted-foreground">
            {stats.responseMs === undefined
              ? "Chưa đo được (chỉ tính câu trả lời bằng giọng nói ngay sau khi AI nói xong)"
              : `Trung vị của ${stats.timedTurns} câu, từ lúc AI nói xong đến lúc bạn bắt đầu nói`}
          </p>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TextIcon className="size-3.5" /> Số từ mỗi lượt
          </p>
          <p className="text-xl font-semibold tabular-nums">{words === null ? "—" : formatDecimal(words)}</p>
          <p className="text-xs text-muted-foreground">Trung bình mỗi lượt bạn nói; trả lời dài hơn là nói trôi hơn</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "warn" }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center">
      <p
        className={
          tone === "success"
            ? "text-2xl font-semibold text-success tabular-nums"
            : tone === "warn"
              ? "text-2xl font-semibold text-amber-600 tabular-nums dark:text-amber-400"
              : "text-2xl font-semibold tabular-nums"
        }
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
