"use client";

import { FlameIcon, MessagesSquareIcon, MicIcon, TargetIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchChats } from "@/lib/chats-client";
import { fetchPhrases } from "@/lib/phrases-client";
import { progressOverview, relativeDayLabel, type ProgressOverview as Overview } from "@/lib/progress";
import { cn } from "@/lib/utils";

const pct = (r: number) => `${Math.round(r * 100)}%`;

/**
 * Home-page progress: streak, sessions, spoken sentences, missions, the last 14 days and how the
 * share of natural sentences moves. Renders nothing until there is practice to show.
 */
export default function ProgressOverview() {
  const [data, setData] = useState<{ overview: Overview; now: number } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchChats().catch(() => null), fetchPhrases().catch(() => null)]).then(([chats, phrases]) => {
      // Hidden only when neither source could be read (e.g. MONGODB_URI not set).
      if (!alive || (!chats && !phrases)) return;
      const now = Date.now();
      const reviews = (phrases ?? []).flatMap((p) => (p.lastReviewedAt ? [p.lastReviewedAt] : []));
      setData({ overview: progressOverview(chats ?? [], reviews, now), now });
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return null;
  const { overview: o, now } = data;
  const empty = o.sessions === 0 && !o.days.some((d) => d.active) && o.streak.best === 0;

  return (
    <section className="mb-8" aria-labelledby="progress-title">
      <h2 id="progress-title" className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Tiến độ của bạn
      </h2>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={FlameIcon}
          label="Chuỗi ngày luyện"
          value={`${o.streak.current} ngày`}
          hint={
            o.streak.current && !o.streak.today
              ? "Luyện hôm nay để giữ chuỗi"
              : o.streak.best > o.streak.current
                ? `Kỷ lục: ${o.streak.best} ngày`
                : o.streak.current
                  ? "Đang là kỷ lục"
                  : "Bắt đầu chuỗi mới hôm nay"
          }
          highlight={o.streak.today}
        />
        <StatTile
          icon={MessagesSquareIcon}
          label="Buổi trò chuyện"
          value={String(o.sessions)}
          hint={`${o.sessionsThisWeek} buổi trong 7 ngày qua`}
        />
        <StatTile icon={MicIcon} label="Câu đã nói" value={String(o.spokenLines)} hint="Trong các buổi trò chuyện" />
        <StatTile
          icon={TargetIcon}
          label="Nhiệm vụ hoàn thành"
          value={String(o.missionsCompleted)}
          hint="Buổi đạt đủ mọi mục tiêu"
        />
      </div>

      {empty && (
        <p className="mt-3 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Chưa có dữ liệu luyện tập. Sau buổi{" "}
          <Link href="/chat" className="font-medium text-primary underline-offset-4 hover:underline">
            trò chuyện
          </Link>{" "}
          hoặc lần ôn{" "}
          <Link href="/phrases" className="font-medium text-primary underline-offset-4 hover:underline">
            sổ tay
          </Link>{" "}
          đầu tiên, chuỗi ngày luyện và biểu đồ sẽ hiện ở đây.
        </p>
      )}

      <div className={cn("mt-3 grid gap-3 lg:grid-cols-2", empty && "hidden")}>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">14 ngày gần đây</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityStrip days={o.days} />
          </CardContent>
        </Card>

        {o.rates.length > 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Tỷ lệ câu tự nhiên theo buổi</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <RateBars rates={o.rates} now={now} />
              {o.trend && <TrendLine recent={o.trend.recent} earlier={o.trend.earlier} />}
            </CardContent>
          </Card>
        )}
      </div>

      {o.focus.length > 0 && (
        <Card size="sm" className="mt-3">
          <CardHeader>
            <CardTitle className="text-sm">Lỗi hay gặp gần đây</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {o.focus.map((f, i) => (
                <li key={i} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="min-w-0 flex-1">{f.issue}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {f.topicLabel} · {relativeDayLabel(f.at, now)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={cn("size-3.5", highlight && "text-primary")} /> {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function ActivityStrip({ days }: { days: Overview["days"] }) {
  const active = days.filter((d) => d.active).length;
  return (
    <div>
      <ol className="grid grid-cols-7 gap-1.5 sm:grid-cols-14" aria-label={`Đã luyện ${active} trên ${days.length} ngày`}>
        {days.map((d) => (
          <li key={d.key} className="flex flex-col items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  aria-label={`${d.weekday} ${d.date}: ${d.active ? "có luyện" : "không luyện"}`}
                  className={cn(
                    "block aspect-square w-full max-w-7 rounded-[4px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    d.active ? "bg-primary" : "bg-muted",
                    d.isToday && "ring-2 ring-primary/40 ring-offset-2 ring-offset-card",
                  )}
                />
              </TooltipTrigger>
              <TooltipContent>
                {d.isToday ? "Hôm nay" : `${d.weekday} ${d.date}`}: {d.active ? "có luyện" : "chưa luyện"}
              </TooltipContent>
            </Tooltip>
            <span className="text-[10px] text-muted-foreground">{d.weekday}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">
        Luyện {active}/{days.length} ngày (trò chuyện hoặc ôn sổ tay).
      </p>
    </div>
  );
}

/** One thin bar per session, height = share of natural sentences. Hover or focus for details. */
function RateBars({ rates, now }: { rates: Overview["rates"]; now: number }) {
  return (
    <div className="relative">
      {/* Recessive guides at 50% and 100%. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
      <ol className="flex h-24 items-end gap-0.5" aria-label="Tỷ lệ câu tự nhiên của các buổi gần đây">
        {rates.map((r) => (
          <li key={r.id} className="flex h-full flex-1 items-end justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  aria-label={`${r.topicLabel}, ${relativeDayLabel(r.at, now)}: ${pct(r.rate)} câu tự nhiên`}
                  className="flex h-full w-full max-w-6 items-end justify-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span
                    className="block w-full max-w-3 rounded-t-[4px] bg-primary"
                    style={{ height: `${Math.max(r.rate * 100, 3)}%` }}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {r.topicLabel} · {relativeDayLabel(r.at, now)} · {pct(r.rate)} câu tự nhiên
              </TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ol>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>Cũ hơn</span>
        <span>Gần nhất</span>
      </div>
    </div>
  );
}

function TrendLine({ recent, earlier }: { recent: number; earlier: number }) {
  const diff = Math.round((recent - earlier) * 100);
  const Icon = diff >= 0 ? TrendingUpIcon : TrendingDownIcon;
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className={cn("size-3.5 shrink-0", diff > 0 && "text-success")} />
      5 buổi gần nhất: <span className="font-medium text-foreground">{pct(recent)}</span>
      {diff === 0 ? " (giữ nguyên)" : ` (${diff > 0 ? "+" : ""}${diff} điểm so với 5 buổi trước)`}
    </p>
  );
}
