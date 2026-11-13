"use client";

import { ArrowLeftIcon, PlayIcon, SaveIcon, SparklesIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ParsedScript } from "@/lib/script";

type Props = {
  raw: string;
  onRawChange: (raw: string) => void;
  parsed: ParsedScript;
  /** Not saved to the server yet. */
  isNew: boolean;
  /** Has changes that are not saved. */
  dirty: boolean;
  canSave: boolean;
  onSave: () => void;
  /** Go to the practice set-up for this script. */
  onPractice: () => void;
  onBack: () => void;
  onOpenGenerate: () => void;
};

/** Writing or editing one script. */
export default function Editor(p: Props) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={p.onBack} className="-ml-2">
            <ArrowLeftIcon /> Quay lại
          </Button>
          <Label htmlFor="script" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {p.isNew ? "Kịch bản mới" : "Sửa kịch bản"}
          </Label>
          {p.dirty && <Badge variant="outline">Chưa lưu</Badge>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={p.onOpenGenerate} className="text-primary">
            <SparklesIcon /> AI viết
          </Button>
          <Button variant="outline" size="sm" onClick={p.onSave} disabled={!p.canSave}>
            <SaveIcon /> {p.isNew ? "Lưu kịch bản" : "Lưu thay đổi"}
          </Button>
          <Button size="sm" onClick={p.onPractice} disabled={p.parsed.lines.length === 0}>
            <PlayIcon /> Luyện
          </Button>
        </div>
      </div>
      <Textarea
        id="script"
        value={p.raw}
        onChange={(e) => p.onRawChange(e.target.value)}
        spellCheck={false}
        className="min-h-[420px] resize-y bg-card p-4 font-mono text-sm leading-relaxed"
        placeholder={"# Tiêu đề\nA: Hello!\nB: Hi, how are you?"}
      />
      <p className="text-xs text-muted-foreground">
        Mỗi dòng một câu theo dạng <Kbd>Tên vai: câu thoại</Kbd>. Dòng bắt đầu bằng <Kbd>#</Kbd> là tiêu đề. Ghi chú
        trong <Kbd>(ngoặc)</Kbd> sẽ không được đọc và không tính điểm.
        {p.parsed.lines.length > 0 &&
          ` Hiện có ${p.parsed.lines.length} câu, ${p.parsed.speakers.length} vai (${p.parsed.speakers.join(", ")}).`}
      </p>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>;
}
