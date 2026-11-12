"use client";

import {
  DownloadIcon,
  FilePlusIcon,
  PlayIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import { useRef } from "react";
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ParsedScript } from "@/lib/script";
import type { LineMode, SavedScript, Settings } from "@/lib/settings";

type Props = {
  raw: string;
  onRawChange: (raw: string) => void;
  parsed: ParsedScript;
  myRoles: string[];
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  voices: SpeechSynthesisVoice[];
  voiceFor: (speaker: string) => string | undefined;
  saved: SavedScript[];
  currentId: string | null;
  onSave: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onLoad: (s: SavedScript) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onStart: () => void;
  recSupported: boolean | null;
};

const MODE_LABELS: Record<LineMode, string> = {
  full: "Hiện đầy đủ",
  hint: "Chỉ gợi ý chữ cái đầu",
  hidden: "Ẩn (tự nhớ)",
};

export default function Editor(p: Props) {
  const { parsed, settings: s } = p;
  const set = (patch: Partial<Settings>) => p.onSettingsChange({ ...s, ...patch });
  const machineSpeakers = parsed.speakers.filter((sp) => !p.myRoles.includes(sp));
  const myLineCount = parsed.lines.filter((l) => p.myRoles.includes(l.speaker)).length;
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Script input */}
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="script" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Kịch bản
          </Label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={p.onNew}>
              <FilePlusIcon /> Mới
            </Button>
            <Button variant="outline" size="sm" onClick={p.onSave} disabled={!parsed.lines.length}>
              <SaveIcon /> {p.currentId ? "Lưu thay đổi" : "Lưu kịch bản"}
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
        </p>

        <Card size="sm" className="mt-2 gap-0 py-0">
          <CardHeader className="flex items-center justify-between gap-2 border-b py-2">
            <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Đã lưu {p.saved.length > 0 && `(${p.saved.length})`}
            </CardTitle>
            <div className="flex gap-1">
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
              <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                <UploadIcon /> Nhập
              </Button>
              <Button variant="ghost" size="sm" onClick={p.onExport} disabled={p.saved.length === 0}>
                <DownloadIcon /> Xuất
              </Button>
            </div>
          </CardHeader>
          {p.saved.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              Chưa có kịch bản nào được lưu. Bấm “Lưu kịch bản”, hoặc “Nhập” để mở file .json đã xuất trước đó.
            </p>
          ) : (
            <ul className="divide-y">
              {p.saved.map((item) => (
                <li
                  key={item.id}
                  className={`flex items-center gap-2 py-1.5 pr-2 pl-3 ${item.id === p.currentId ? "bg-accent/60" : ""}`}
                >
                  <button
                    className="min-w-0 flex-1 truncate text-left text-sm hover:text-primary"
                    onClick={() => p.onLoad(item)}
                  >
                    {item.title}
                  </button>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(item.updatedAt).toLocaleDateString("vi-VN")}
                  </span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Xoá ${item.title}`}>
                        <Trash2Icon className="text-muted-foreground" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent size="sm">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Xoá kịch bản?</AlertDialogTitle>
                        <AlertDialogDescription>“{item.title}” sẽ bị xoá khỏi trình duyệt này.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Huỷ</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => p.onDelete(item.id)}>
                          Xoá
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Settings */}
      <Card className="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <CardHeader>
          <CardDescription>{parsed.title || "Chưa có tiêu đề"}</CardDescription>
          <CardTitle>
            {parsed.lines.length} câu · {parsed.speakers.length} vai
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <Field label="Bạn đóng vai">
            {parsed.speakers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa nhận ra vai nào.</p>
            ) : (
              <ToggleGroup
                type="multiple"
                variant="outline"
                value={p.myRoles}
                onValueChange={(v) => v.length && set({ myRoles: v })}
                className="flex-wrap"
              >
                {parsed.speakers.map((sp) => (
                  <ToggleGroupItem
                    key={sp}
                    value={sp}
                    className="rounded-full px-3 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {sp}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          </Field>

          {machineSpeakers.length > 0 && (
            <Field label="Giọng máy">
              <div className="flex flex-col gap-2">
                {machineSpeakers.map((sp) => (
                  <div key={sp} className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-2">
                    <span className="truncate text-sm font-medium">{sp}</span>
                    <Select
                      value={p.voiceFor(sp) ?? ""}
                      onValueChange={(v) => set({ voices: { ...s.voices, [sp]: v } })}
                      disabled={p.voices.length === 0}
                    >
                      <SelectTrigger className="w-full min-w-0" aria-label={`Giọng đọc của ${sp}`}>
                        <SelectValue placeholder="Giọng mặc định" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="max-h-72 max-w-[min(24rem,90vw)]">
                        {p.voices.map((v) => (
                          <SelectItem key={v.voiceURI} value={v.voiceURI}>
                            <span className="truncate">{v.name}</span>
                            <span className="text-xs text-muted-foreground">{v.lang}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </Field>
          )}

          <Field label="Tốc độ đọc" value={`${s.rate.toFixed(2)}x`}>
            <Slider min={0.6} max={1.3} step={0.05} value={[s.rate]} onValueChange={([v]) => set({ rate: v })} />
          </Field>

          <Field label="Câu thoại của bạn">
            <Select value={s.myLineMode} onValueChange={(v) => set({ myLineMode: v as LineMode })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {Object.entries(MODE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Điểm đạt" value={`${s.threshold}%`}>
            <Slider min={50} max={100} step={5} value={[s.threshold]} onValueChange={([v]) => set({ threshold: v })} />
          </Field>

          <Separator />

          <div className="flex flex-col gap-3">
            <CheckField
              id="show-partner"
              checked={s.showPartnerText}
              onChange={(v) => set({ showPartnerText: v })}
              label="Hiện chữ của vai máy"
              hint="Tắt đi để luyện nghe"
            />
            <CheckField
              id="auto-advance"
              checked={s.autoAdvance}
              onChange={(v) => set({ autoAdvance: v })}
              label="Tự chuyển câu khi đạt điểm"
            />
          </div>

          {p.recSupported === false && (
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <TriangleAlertIcon className="size-4 shrink-0" />
              Trình duyệt này không hỗ trợ nhận giọng nói, bạn sẽ phải gõ câu trả lời. Nên dùng Chrome hoặc Edge.
            </div>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-2">
          <Button size="lg" className="w-full" disabled={myLineCount === 0} onClick={p.onStart}>
            <PlayIcon /> Bắt đầu hội thoại
          </Button>
          {myLineCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Bạn sẽ nói <Badge variant="secondary">{myLineCount}</Badge> câu
            </p>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

function Field({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
        {value && <span className="text-xs font-medium tabular-nums">{value}</span>}
      </div>
      {children}
    </div>
  );
}

function CheckField(props: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox id={props.id} checked={props.checked} onCheckedChange={(v) => props.onChange(v === true)} className="mt-0.5" />
      <div className="grid gap-0.5">
        <Label htmlFor={props.id} className="font-normal">
          {props.label}
        </Label>
        {props.hint && <span className="text-xs text-muted-foreground">{props.hint}</span>}
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>;
}
