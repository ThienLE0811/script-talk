"use client";

import {
  BookOpenCheckIcon,
  Loader2Icon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  Volume2Icon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { aiErrorText, AiRequestError } from "@/lib/ai-errors";
import {
  dueLabel,
  isDue,
  isMastered,
  MAX_BOX,
  MAX_NOTE_LENGTH,
  MAX_PHRASE_LENGTH,
  phraseStats,
  reviewQueue,
  type Phrase,
  type PhraseSource,
} from "@/lib/phrasebook";
import { addPhrases, deletePhrase, fetchPhrases } from "@/lib/phrases-client";
import { DEFAULT_SETTINGS, loadJSON, STORAGE_KEYS } from "@/lib/settings";
import { isRecognitionSupported, speak, stopSpeaking, useEnglishVoices } from "@/lib/speech";
import { cn } from "@/lib/utils";
import PhraseReview from "./PhraseReview";

type Filter = "due" | "all" | "mastered";
type Status = { state: "loading" } | { state: "ready" } | { state: "error"; code: string };

const SOURCE_LABEL: Record<PhraseSource, string> = { chat: "Trò chuyện", script: "Kịch bản", manual: "Tự thêm" };

export default function Phrasebook() {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [filter, setFilter] = useState<Filter>("due");
  const [reviewing, setReviewing] = useState<Phrase[] | null>(null);
  const [newText, setNewText] = useState("");
  const [newNote, setNewNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [rate, setRate] = useState(DEFAULT_SETTINGS.rate);
  const [recSupported, setRecSupported] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const voices = useEnglishVoices();
  const voiceURI = voices[0]?.voiceURI;

  const load = async () => {
    setStatus({ state: "loading" });
    try {
      setPhrases(await fetchPhrases());
      setNow(Date.now());
      setStatus({ state: "ready" });
    } catch (err) {
      setStatus({ state: "error", code: err instanceof AiRequestError ? err.code : "network" });
    }
  };

  useEffect(() => {
    setRate(loadJSON(STORAGE_KEYS.settings, DEFAULT_SETTINGS).rate);
    setRecSupported(isRecognitionSupported());
    void load();
    return () => stopSpeaking();
  }, []);

  const stats = useMemo(() => phraseStats(phrases, now), [phrases, now]);
  const visible = useMemo(() => {
    const list = filter === "due" ? phrases.filter((p) => isDue(p, now)) : filter === "mastered" ? phrases.filter(isMastered) : phrases;
    return filter === "all" ? [...list].sort((a, b) => b.createdAt - a.createdAt) : list;
  }, [phrases, filter, now]);

  const addOne = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || adding) return;
    setAdding(true);
    try {
      const res = await addPhrases([{ text: newText, note: newNote || undefined, source: "manual" }]);
      if (res.added) toast.success("Đã thêm vào sổ tay");
      else toast.info("Câu này đã có trong sổ tay");
      setNewText("");
      setNewNote("");
      await load();
    } catch (err) {
      toast.error("Chưa thêm được câu", { description: aiErrorText(err instanceof AiRequestError ? err.code : "network") });
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deletePhrase(id);
    } catch (err) {
      if (!(err instanceof AiRequestError && err.code === "not_found")) {
        toast.error("Chưa xoá được câu", { description: aiErrorText(err instanceof AiRequestError ? err.code : "network") });
        return;
      }
    }
    setPhrases((list) => list.filter((p) => p.id !== id));
  };

  const play = (text: string) => {
    stopSpeaking();
    void speak(text, { voiceURI, rate });
  };

  if (reviewing) {
    return (
      <PhraseReview
        queue={reviewing}
        voiceURI={voiceURI}
        rate={rate}
        recSupported={recSupported}
        onReviewed={(p) => setPhrases((list) => list.map((x) => (x.id === p.id ? p : x)))}
        onExit={() => {
          setReviewing(null);
          setNow(Date.now());
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  const queue = reviewQueue(phrases, now);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sổ tay câu</h1>
        <p className="text-sm text-muted-foreground">
          Câu được AI sửa khi trò chuyện tự động vào đây. Ôn theo lịch: câu đạt sẽ được nhắc lại thưa dần (1, 2, 4, 8…
          ngày), câu chưa đạt được nhắc lại ngay lần sau.
        </p>
      </div>

      {status.state === "error" ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 text-sm">
            <p className="flex gap-2 text-destructive">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" /> {aiErrorText(status.code)}
            </p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RotateCcwIcon /> Thử lại
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Cần ôn hôm nay" value={stats.due} tone={stats.due ? "primary" : undefined} />
            <Stat label="Đã thuộc" value={stats.mastered} tone="success" />
            <Stat label="Tổng số câu" value={stats.total} />
          </div>

          <Button
            size="lg"
            className="h-12 text-base"
            disabled={status.state !== "ready" || queue.length === 0}
            onClick={() => {
              setReviewing(queue);
              window.scrollTo({ top: 0 });
            }}
          >
            <BookOpenCheckIcon />
            {status.state === "loading"
              ? "Đang tải…"
              : queue.length
                ? `Ôn ${queue.length} câu ngay`
                : "Hôm nay không còn câu nào cần ôn"}
          </Button>

          <Card size="sm">
            <CardContent>
              <form onSubmit={addOne} className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  maxLength={MAX_PHRASE_LENGTH}
                  placeholder="Thêm câu tiếng Anh muốn luyện…"
                  className="sm:flex-[2]"
                />
                <Input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  maxLength={MAX_NOTE_LENGTH}
                  placeholder="Ghi chú / nghĩa (tuỳ chọn)"
                  className="sm:flex-1"
                />
                <Button type="submit" disabled={!newText.trim() || adding}>
                  {adding ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Thêm
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3">
            <ToggleGroup
              type="single"
              variant="outline"
              value={filter}
              onValueChange={(v) => v && setFilter(v as Filter)}
              className="flex-wrap"
            >
              <ToggleGroupItem value="due" className="rounded-full px-3">
                Cần ôn ({stats.due})
              </ToggleGroupItem>
              <ToggleGroupItem value="all" className="rounded-full px-3">
                Tất cả ({stats.total})
              </ToggleGroupItem>
              <ToggleGroupItem value="mastered" className="rounded-full px-3">
                Đã thuộc ({stats.mastered})
              </ToggleGroupItem>
            </ToggleGroup>

            {status.state === "loading" ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" /> Đang tải sổ tay…
              </p>
            ) : visible.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                {stats.total === 0
                  ? "Sổ tay đang trống. Hãy trò chuyện ở chế độ Trò chuyện tự nhiên (câu được sửa sẽ tự vào đây), lưu các câu chưa đạt khi luyện kịch bản, hoặc tự thêm câu ở ô phía trên."
                  : filter === "due"
                    ? "Không còn câu nào cần ôn hôm nay. Quay lại vào ngày mai nhé!"
                    : "Chưa có câu nào ở mục này."}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {visible.map((p) => (
                  <PhraseRow key={p.id} phrase={p} now={now} onPlay={play} onDelete={() => void remove(p.id)} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PhraseRow({
  phrase: p,
  now,
  onPlay,
  onDelete,
}: {
  phrase: Phrase;
  now: number;
  onPlay: (text: string) => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-start gap-2 rounded-xl border bg-card p-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{p.text}</p>
        {p.original && <p className="text-sm text-muted-foreground line-through decoration-destructive/50">{p.original}</p>}
        {p.note && <p className="mt-0.5 text-sm text-muted-foreground">{p.note}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{SOURCE_LABEL[p.source]}</Badge>
          {p.context && <span className="truncate">{p.context}</span>}
          <span aria-label={`Mức nhớ ${p.box}/${MAX_BOX}`} title={`Mức nhớ ${p.box}/${MAX_BOX}`} className="flex gap-0.5">
            {Array.from({ length: MAX_BOX }, (_, i) => (
              <span key={i} className={cn("size-1.5 rounded-full", i < p.box ? "bg-primary" : "bg-border")} />
            ))}
          </span>
          <span className={cn(isDue(p, now) && "font-medium text-primary")}>{dueLabel(p.dueAt, now)}</span>
          {p.lastScore !== undefined && <span>· lần trước {p.lastScore}%</span>}
        </div>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label={`Nghe: ${p.text}`} onClick={() => onPlay(p.text)}>
        <Volume2Icon />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Xoá câu khỏi sổ tay">
            <Trash2Icon className="text-muted-foreground" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá câu khỏi sổ tay?</AlertDialogTitle>
            <AlertDialogDescription>“{p.text}” và tiến độ ôn của nó sẽ bị xoá.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "primary" | "success" }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center">
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "primary" && "text-primary",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
