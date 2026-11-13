"use client";

import {
  ArrowDownUpIcon,
  ChevronRightIcon,
  CloudUploadIcon,
  DownloadIcon,
  FilePenLineIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TablePager, usePagination } from "@/components/common/TablePager";
import { aiErrorText } from "@/lib/ai-errors";
import { fold } from "@/lib/search";
import { relativeDayLabel } from "@/lib/progress";
import { parseScript } from "@/lib/script";
import { SAVED_SORTS, sortSavedScripts, type SavedScript, type SavedSort } from "@/lib/settings";
import type { SavedStatus } from "./ScriptPractice";

type Props = {
  saved: SavedScript[];
  savedStatus: SavedStatus;
  onRetryLoad: () => void;
  /** Scripts saved in this browser before the database existed, not yet on the server. */
  localOnlyCount: number;
  onMigrateLocal: () => void;
  /** A save / delete / import is in progress. */
  busy: boolean;
  sort: SavedSort;
  onSortChange: (sort: SavedSort) => void;
  /** Unsaved work in the editor, if any. */
  draft: { title: string } | null;
  onContinueDraft: () => void;
  onDiscardDraft: () => void;
  /** Open the practice set-up of a saved script. */
  onOpen: (id: string) => void;
  onEdit: (s: SavedScript) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onOpenSample: () => void;
  onOpenGenerate: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
};

/** Show the search box from this many saved scripts. */
const SEARCH_FROM = 5;
/** Show the sort menu from this many saved scripts. */
const SORT_FROM = 2;
/** Rows per page of the table. */
const PAGE_SIZE = 10;

/** The saved scripts as a table: click a row to set up and practise it. */
export default function ScriptLibrary(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const ready = p.savedStatus.state === "ready";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Luyện theo kịch bản</h1>
          <p className="text-sm text-muted-foreground">
            Chọn một kịch bản để luyện. Máy đọc các vai còn lại, bạn nói phần của mình và được chấm từng từ.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={p.onOpenGenerate} className="text-primary">
            <SparklesIcon /> AI viết
          </Button>
          <Button onClick={p.onNew}>
            <PlusIcon /> Tạo mới
          </Button>
        </div>
      </div>

      {p.draft && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-accent/50 px-3 py-2.5 text-sm">
          <FilePenLineIcon className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            Bản nháp chưa lưu: <span className="font-medium">{p.draft.title}</span>
          </span>
          <Button size="sm" variant="ghost" onClick={p.onDiscardDraft}>
            Bỏ nháp
          </Button>
          <Button size="sm" onClick={p.onContinueDraft}>
            Tiếp tục soạn
          </Button>
        </div>
      )}

      <Card className="gap-0 overflow-hidden py-0">
        {ready && p.localOnlyCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-accent/50 px-3 py-2.5 text-sm">
            <CloudUploadIcon className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              Có {p.localOnlyCount} kịch bản chỉ nằm trong trình duyệt này, chưa có trên server.
            </span>
            <Button size="sm" onClick={p.onMigrateLocal} disabled={p.busy}>
              Chuyển lên server
            </Button>
          </div>
        )}

        {p.savedStatus.state === "loading" ? (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Đang tải kịch bản…
          </p>
        ) : p.savedStatus.state === "error" ? (
          <div className="flex flex-col items-start gap-2 px-4 py-6 text-sm">
            <p className="flex gap-2 text-destructive">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" /> {aiErrorText(p.savedStatus.code)}
            </p>
            <Button variant="outline" size="sm" onClick={p.onRetryLoad}>
              <RotateCcwIcon /> Thử lại
            </Button>
          </div>
        ) : p.saved.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <p className="font-medium">Chưa có kịch bản nào</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Tự viết một kịch bản, nhờ AI viết theo chủ đề, mở kịch bản mẫu để thử, hoặc nhập file .json đã xuất trước
              đó.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={p.onOpenSample}>
                Mở kịch bản mẫu
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={p.busy}>
                <UploadIcon /> Nhập file
              </Button>
            </div>
          </div>
        ) : (
          <ScriptTable {...p} onImportClick={() => fileRef.current?.click()} />
        )}
      </Card>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow picking the same file again
          if (file) p.onImport(file);
        }}
      />
    </div>
  );
}

function ScriptTable(p: Props & { onImportClick: () => void }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () =>
      sortSavedScripts(p.saved, p.sort).map((s) => {
        const parsed = parseScript(s.raw);
        return { script: s, lines: parsed.lines.length, speakers: parsed.speakers, haystack: fold(`${s.title}\n${s.raw}`) };
      }),
    [p.saved, p.sort],
  );
  const q = fold(query.trim());
  const visible = q ? rows.filter((r) => r.haystack.includes(q)) : rows;
  const sortValue = SAVED_SORTS.some((o) => o.value === p.sort) ? p.sort : "updated";
  const now = Date.now();
  const { current, pageCount, first, rows: pageRows, scrollRef, goToPage } = usePagination(visible, PAGE_SIZE);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        {p.saved.length >= SEARCH_FROM && (
          <div className="relative min-w-48 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                goToPage(0);
              }}
              placeholder="Tìm theo tiêu đề hoặc nội dung…"
              aria-label="Tìm kịch bản"
              className="h-8 pl-8"
            />
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          {p.saved.length >= SORT_FROM && (
            <Select
              value={sortValue}
              onValueChange={(v) => {
                p.onSortChange(v as SavedSort);
                goToPage(0);
              }}
            >
              <SelectTrigger aria-label="Sắp xếp kịch bản" className="shrink-0">
                <ArrowDownUpIcon className="text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                {SAVED_SORTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="sm" onClick={p.onImportClick} disabled={p.busy}>
            <UploadIcon /> Nhập
          </Button>
          <Button variant="ghost" size="sm" onClick={p.onExport}>
            <DownloadIcon /> Xuất
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Không có kịch bản nào khớp “{query.trim()}”.</p>
      ) : (
        // Height-capped: long pages scroll inside the table, with the header row kept in view.
        <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto overscroll-contain">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]">
              <tr>
                <th className="px-4 py-2 font-medium">Kịch bản</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Số câu</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Đã luyện</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Luyện gần nhất</th>
                <th className="w-px px-2 py-2">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pageRows.map(({ script: item, lines, speakers }) => (
                <tr
                  key={item.id}
                  className="group cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => p.onOpen(item.id)}
                >
                  <td className="max-w-0 px-4 py-2.5">
                    {/* The row is the click target; this button makes it reachable by keyboard. */}
                    <button className="block w-full truncate text-left font-medium outline-none group-hover:text-primary focus-visible:text-primary focus-visible:underline">
                      {item.title}
                    </button>
                    <span className="block truncate text-xs text-muted-foreground">
                      <span className="sm:hidden">
                        {lines} câu · {item.practiceCount ? `luyện ${item.practiceCount} lần` : "chưa luyện"}
                        {speakers.length > 0 && " · "}
                      </span>
                      {speakers.join(", ")}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{lines}</td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">
                    {item.practiceCount ? `${item.practiceCount} lần` : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="hidden px-3 py-2.5 whitespace-nowrap text-muted-foreground md:table-cell">
                    {item.lastPracticedAt ? relativeDayLabel(item.lastPracticedAt, now) : "Chưa luyện"}
                  </td>
                  {/* Stop clicks here (including inside the delete dialog, which bubbles through React) from opening the row. */}
                  <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon-sm" aria-label={`Sửa ${item.title}`} onClick={() => p.onEdit(item)}>
                        <PencilIcon className="text-muted-foreground" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Xoá ${item.title}`} disabled={p.busy}>
                            <Trash2Icon className="text-muted-foreground" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent size="sm">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Xoá kịch bản?</AlertDialogTitle>
                            <AlertDialogDescription>
                              “{item.title}” sẽ bị xoá khỏi server, trên mọi thiết bị. Nên bấm “Xuất” trước nếu muốn giữ
                              bản sao.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Huỷ</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => p.onDelete(item.id)}>
                              Xoá
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <ChevronRightIcon className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visible.length > 0 && (pageCount > 1 || q) && (
        <TablePager current={current} pageCount={pageCount} onPageChange={goToPage}>
          {pageCount > 1 && `${first + 1}–${first + pageRows.length} / `}
          {visible.length} kịch bản{q && ` khớp (trong ${p.saved.length})`}
        </TablePager>
      )}
    </>
  );
}
