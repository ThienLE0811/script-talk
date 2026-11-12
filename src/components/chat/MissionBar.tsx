import { CheckCircle2Icon, CircleIcon, Loader2Icon, TargetIcon } from "lucide-react";
import type { Mission } from "@/lib/chat/mission";
import { cn } from "@/lib/utils";

/** Full mission card: the brief and every goal with its status. */
export function MissionCard({ mission, done, className }: { mission: Mission; done: number[]; className?: string }) {
  const complete = done.length === mission.goals.length;
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        complete ? "border-success/40 bg-success/10" : "border-primary/30 bg-accent/60",
        className,
      )}
    >
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <TargetIcon className="size-3.5" /> Nhiệm vụ · {done.length}/{mission.goals.length}
      </p>
      {mission.brief && <p className="mb-2">{mission.brief}</p>}
      <ul className="flex flex-col gap-1">
        {mission.goals.map((g, i) => {
          const ok = done.includes(i);
          return (
            <li key={i} className={cn("flex items-start gap-2", ok && "text-muted-foreground line-through")}>
              {ok ? (
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              {g}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One line for the control bar: progress and the next goal to work on. */
export function MissionProgress({ mission, done }: { mission: Mission; done: number[] }) {
  const next = mission.goals.findIndex((_, i) => !done.includes(i));
  return (
    <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
      <TargetIcon className={cn("size-3.5 shrink-0", next < 0 ? "text-success" : "text-primary")} />
      <span className="font-medium text-foreground tabular-nums">
        {done.length}/{mission.goals.length}
      </span>
      <span className="truncate">{next < 0 ? "Đã hoàn thành nhiệm vụ" : `Tiếp theo: ${mission.goals[next]}`}</span>
    </p>
  );
}

export function MissionLoading() {
  return (
    <p className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" /> Đang soạn nhiệm vụ cho bạn…
    </p>
  );
}
