"use client";

import { Loader2Icon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { aiErrorText, AiRequestError, postJSON } from "@/lib/ai-errors";
import { LEVELS, type LevelId } from "@/lib/chat/prompts";
import {
  MAX_TOPIC_LENGTH,
  SCRIPT_LENGTHS,
  TOPIC_SUGGESTIONS,
  type GeneratedScript,
  type ScriptLength,
} from "@/lib/generate-script";
import { loadJSON, saveJSON, STORAGE_KEYS } from "@/lib/settings";

type Prefs = { level: LevelId; length: ScriptLength };
const DEFAULT_PREFS: Prefs = { level: "intermediate", length: "medium" };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True when the editor holds text that would be replaced. */
  willReplace: boolean;
  onGenerated: (script: GeneratedScript) => void;
};

const toggleItemClass =
  "rounded-full px-3 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";

export default function GenerateScriptDialog({ open, onOpenChange, willReplace, onGenerated }: Props) {
  const [topic, setTopic] = useState("");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setPrefs(loadJSON(STORAGE_KEYS.generate, DEFAULT_PREFS));
  }, []);
  const setPref = (patch: Partial<Prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      saveJSON(STORAGE_KEYS.generate, next);
      return next;
    });

  const close = (next: boolean) => {
    if (!next) abortRef.current?.abort();
    onOpenChange(next);
  };

  const generate = async () => {
    if (!topic.trim() || loading) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const script = await postJSON<GeneratedScript>(
        "/api/script/generate",
        { topic: topic.trim(), level: prefs.level, length: prefs.length },
        ac.signal,
      );
      onGenerated(script);
      onOpenChange(false);
      setTopic("");
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(aiErrorText(err instanceof AiRequestError ? err.code : "network"));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-primary" /> AI viết kịch bản
          </DialogTitle>
          <DialogDescription>
            Nhập tình huống bằng tiếng Việt hoặc tiếng Anh. Gemini sẽ viết hội thoại hai vai và tự chọn vai cho bạn.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
          <div className="flex flex-col gap-2">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={MAX_TOPIC_LENGTH}
              placeholder="Ví dụ: gọi điện đặt lịch cắt tóc"
              autoFocus
              disabled={loading}
            />
            <div className="flex flex-wrap gap-1.5">
              {TOPIC_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={loading}
                  onClick={() => setTopic(s)}
                  className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Trình độ</span>
            <ToggleGroup
              type="single"
              variant="outline"
              value={prefs.level}
              onValueChange={(v) => v && setPref({ level: v as LevelId })}
              className="flex-wrap"
              disabled={loading}
            >
              {LEVELS.map((l) => (
                <ToggleGroupItem key={l.id} value={l.id} className={toggleItemClass}>
                  {l.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Độ dài</span>
            <ToggleGroup
              type="single"
              variant="outline"
              value={prefs.length}
              onValueChange={(v) => v && setPref({ length: v as ScriptLength })}
              className="flex-wrap"
              disabled={loading}
            >
              {SCRIPT_LENGTHS.map((l) => (
                <ToggleGroupItem key={l.id} value={l.id} className={toggleItemClass}>
                  {l.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {error && (
            <p className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" /> {error}
            </p>
          )}
          {willReplace && !error && (
            <p className="text-xs text-muted-foreground">
              Nội dung đang có trong ô soạn sẽ được thay bằng kịch bản mới. Kịch bản đã lưu không bị ảnh hưởng.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Huỷ
            </Button>
            <Button type="submit" disabled={!topic.trim() || loading}>
              {loading ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              {loading ? "Đang viết…" : "Viết kịch bản"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
