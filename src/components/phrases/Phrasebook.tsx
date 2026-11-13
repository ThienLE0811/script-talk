"use client";

import {
  BookOpenCheckIcon,
  Loader2Icon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
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
import { TablePager, usePagination } from "@/components/common/TablePager";
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
import { fold } from "@/lib/search";
import { DEFAULT_SETTINGS, loadJSON, STORAGE_KEYS } from "@/lib/settings";
import { isRecognitionSupported, speak, stopSpeaking, useEnglishVoices } from "@/lib/speech";
import { cn } from "@/lib/utils";
import PhraseReview from "./PhraseReview";

type Filter = "due" | "all" | "mastered";
type Status = { state: "loading" } | { state: "ready" } | { state: "error"; code: string };

const SOURCE_LABEL: Record<PhraseSource, string> = { chat: "Trò chuyện", script: "Kịch bản", manual: "Tự thêm" };
/** Rows per page of the table. */
const PAGE_SIZE = 20;
/** Show the search box from this many phrases. */
const SEARCH_FROM = 5;

export default function Phrasebook() {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [filter, setFilter] = useState<Filter>("due");
  const [query, setQuery] = useState("");
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
    const q = fold(query.trim());
    const found = q
      ? list.filter((p) => fold([p.text, p.original, p.note, p.context].filter(Boolean).join("\n")).includes(q))
      : list;
    return filter === "all" ? [...found].sort((a, b) => b.createdAt - a.createdAt) : found;
  }, [phrases, filter, now, query]);
  const { current, pageCount, first, rows: pageRows, scrollRef, goToPage } = usePagination(visible, PAGE_SIZE);

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
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
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

          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-center gap-2 border-b p-2">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={filter}
                onValueChange={(v) => {
                  if (!v) return;
                  setFilter(v as Filter);
                  goToPage(0);
                }}
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
              {phrases.length >= SEARCH_FROM && (
                <div className="relative min-w-48 flex-1">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      goToPage(0);
                    }}
                    placeholder="Tìm câu, ghi chú…"
                    aria-label="Tìm trong sổ tay"
                    className="h-8 pl-8"
                  />
                </div>
              )}
            </div>

            {status.state === "loading" ? (
              <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" /> Đang tải sổ tay…
              </p>
            ) : visible.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                {emptyText(stats.total, filter, query.trim())}
              </p>
            ) : (
              // Height-capped: long pages scroll inside the table, with the header row kept in view.
              <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto overscroll-contain">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]">
                    <tr>
                      {/* "Câu" takes the free width; the other columns are as narrow as their content (w-px). */}
                      <th className="px-4 py-2 font-medium">Câu</th>
                      <th className="hidden w-px px-3 py-2 font-medium whitespace-nowrap md:table-cell">Nguồn</th>
                      <th className="hidden w-px px-3 py-2 font-medium whitespace-nowrap sm:table-cell">Mức nhớ</th>
                      <th className="hidden w-px px-3 py-2 font-medium whitespace-nowrap sm:table-cell">Ôn lại</th>
                      <th className="w-px px-2 py-2">
                        <span className="sr-only">Thao tác</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pageRows.map((p) => (
                      <PhraseRow key={p.id} phrase={p} now={now} onPlay={play} onDelete={() => void remove(p.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {visible.length > 0 && (pageCount > 1 || query.trim()) && (
              <TablePager current={current} pageCount={pageCount} onPageChange={goToPage}>
                {pageCount > 1 && `${first + 1}–${first + pageRows.length} / `}
                {visible.length} câu
              </TablePager>
            )}
          </Card>
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
  const [noteOpen, setNoteOpen] = useState(false);
  const due = <span className={cn(isDue(p, now) && "font-medium text-primary")}>{dueLabel(p.dueAt, now)}</span>;
  return (
    <tr className="align-top transition-colors hover:bg-muted/30">
      <td className="px-4 py-3">
        <p className="font-medium wrap-break-word">{p.text}</p>
        {p.original && (
          <p className="mt-0.5 text-xs text-muted-foreground line-through decoration-destructive/50 wrap-break-word">
            {p.original}
          </p>
        )}
        {p.note && (
          // Explanations can be long: two lines, click to read all.
          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            aria-expanded={noteOpen}
            title={noteOpen ? "Thu gọn" : "Bấm để xem đầy đủ"}
            className={cn(
              "mt-1 block max-w-prose cursor-pointer text-left text-xs leading-relaxed text-muted-foreground wrap-break-word hover:text-foreground",
              !noteOpen && "line-clamp-2",
            )}
          >
            {p.note}
          </button>
        )}
        {/* Columns hidden on small screens, folded into one line. */}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:hidden">
          <Badge variant="secondary">{SOURCE_LABEL[p.source]}</Badge>
          <BoxDots box={p.box} />
          {due}
        </p>
      </td>
      <td className="hidden px-3 py-3 md:table-cell">
        <Badge variant="secondary">{SOURCE_LABEL[p.source]}</Badge>
        {p.context && (
          <p className="mt-1 max-w-40 truncate text-xs text-muted-foreground" title={p.context}>
            {p.context}
          </p>
        )}
      </td>
      <td className="hidden px-3 py-3 whitespace-nowrap sm:table-cell">
        <BoxDots box={p.box} />
        {p.lastScore !== undefined && <p className="mt-1 text-xs text-muted-foreground">lần trước {p.lastScore}%</p>}
      </td>
      <td className="hidden px-3 py-3 whitespace-nowrap sm:table-cell">{due}</td>
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-0.5">
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
        </div>
      </td>
    </tr>
  );
}

/** Memory level as dots: one per Leitner box reached. */
function BoxDots({ box }: { box: number }) {
  return (
    <span aria-label={`Mức nhớ ${box}/${MAX_BOX}`} title={`Mức nhớ ${box}/${MAX_BOX}`} className="inline-flex gap-0.5">
      {Array.from({ length: MAX_BOX }, (_, i) => (
        <span key={i} className={cn("size-1.5 rounded-full", i < box ? "bg-primary" : "bg-border")} />
      ))}
    </span>
  );
}

function emptyText(total: number, filter: Filter, query: string): string {
  if (total === 0) {
    return "Sổ tay đang trống. Hãy trò chuyện ở chế độ Trò chuyện tự nhiên (câu được sửa sẽ tự vào đây), lưu các câu chưa đạt khi luyện kịch bản, hoặc tự thêm câu ở ô phía trên.";
  }
  if (query) return `Không có câu nào khớp “${query}”.`;
  if (filter === "due") return "Không còn câu nào cần ôn hôm nay. Quay lại vào ngày mai nhé!";
  return "Chưa có câu nào ở mục này.";
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
