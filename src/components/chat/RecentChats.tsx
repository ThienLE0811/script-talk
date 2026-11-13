"use client";

import { ChevronRightIcon, HistoryIcon, Loader2Icon, TargetIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { aiErrorText, AiRequestError } from "@/lib/ai-errors";
import type { ChatSessionMeta } from "@/lib/chat/history";
import { LEVELS } from "@/lib/chat/prompts";
import { deleteChat, fetchChats } from "@/lib/chats-client";
import { relativeDayLabel } from "@/lib/progress";

const COLLAPSED_COUNT = 4;

type Props = {
  /** Id of the session being opened, to show a spinner on it. */
  opening: string | null;
  onOpen: (id: string) => void;
};

/** Saved conversations on the chat setup screen. Renders nothing when there are none or no database. */
export default function RecentChats({ opening, onOpen }: Props) {
  const [list, setList] = useState<ChatSessionMeta[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchChats()
      .then((data) => {
        if (!alive) return;
        setNow(Date.now());
        setList(data);
      })
      .catch(() => {
        /* no history section without data (e.g. MONGODB_URI not set) */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!list?.length) return null;

  const remove = async (id: string) => {
    try {
      await deleteChat(id);
      setList((l) => l?.filter((s) => s.id !== id) ?? null);
    } catch (err) {
      toast.error("Chưa xoá được buổi trò chuyện", {
        description: aiErrorText(err instanceof AiRequestError ? err.code : "network"),
      });
    }
  };

  const shown = expanded ? list : list.slice(0, COLLAPSED_COUNT);
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <HistoryIcon className="size-3.5" /> Buổi trò chuyện gần đây
      </h2>
      <ul
        className={
          expanded
            ? "flex max-h-[28rem] flex-col divide-y overflow-y-auto rounded-xl border bg-card"
            : "flex flex-col divide-y rounded-xl border bg-card"
        }
      >
        {shown.map((s) => (
          <li key={s.id} className="flex items-center gap-1 pr-2">
            <button
              type="button"
              onClick={() => onOpen(s.id)}
              disabled={opening !== null}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-l-xl px-4 py-3 text-left outline-none hover:bg-accent/50 focus-visible:bg-accent/50 disabled:opacity-70"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.topicLabel || "Trò chuyện"}</span>
                <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  <span>{relativeDayLabel(s.updatedAt, now)}</span>
                  <span>· {LEVELS.find((l) => l.id === s.level)?.label}</span>
                  {s.challenge && <span className="text-amber-600 dark:text-amber-400">· Tình huống khó</span>}
                  <span>· {s.stats.userTurns} câu</span>
                  {s.stats.userTurns > 0 && <span>· {s.stats.good} tự nhiên</span>}
                  {s.stats.goalCount > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      · <TargetIcon className="size-3" /> {s.stats.goalsDone}/{s.stats.goalCount}
                    </span>
                  )}
                </span>
              </span>
              {opening === s.id ? (
                <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
              )}
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Xoá buổi trò chuyện">
                  <Trash2Icon className="text-muted-foreground" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>Xoá buổi trò chuyện?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Lời thoại và tổng kết của buổi “{s.topicLabel}” sẽ bị xoá. Các câu đã vào sổ tay vẫn được giữ.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Huỷ</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => void remove(s.id)}>
                    Xoá
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </li>
        ))}
      </ul>
      {list.length > COLLAPSED_COUNT && (
        <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Thu gọn" : `Xem tất cả ${list.length} buổi`}
        </Button>
      )}
    </section>
  );
}
