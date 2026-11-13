"use client";

import { ArrowLeftIcon, PencilIcon, PlayIcon, RepeatIcon, TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ParsedScript } from "@/lib/script";
import type { LineMode, Settings } from "@/lib/settings";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  /** Practising the unsaved script from the editor (not counted). */
  isDraft: boolean;
  practiceCount?: number;
  parsed: ParsedScript;
  myRoles: string[];
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  voices: SpeechSynthesisVoice[];
  voiceFor: (speaker: string) => string | undefined;
  recSupported: boolean | null;
  onStart: () => void;
  onBack: () => void;
  onEdit: () => void;
};

const MODE_LABELS: Record<LineMode, string> = {
  full: "Hiện đầy đủ",
  hint: "Chỉ gợi ý chữ cái đầu",
  hidden: "Ẩn (tự nhớ)",
};

/** Before practising: pick roles, voices and display options, with the script shown for reference. */
export default function PracticeSetup(p: Props) {
  const { parsed, settings: s } = p;
  const set = (patch: Partial<Settings>) => p.onSettingsChange({ ...s, ...patch });
  const machineSpeakers = parsed.speakers.filter((sp) => !p.myRoles.includes(sp));
  const myLineCount = parsed.lines.filter((l) => p.myRoles.includes(l.speaker)).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={p.onBack} className="-ml-2">
          <ArrowLeftIcon /> Quay lại
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Script preview (below the settings on small screens) */}
        <Card className="order-2 min-w-0 lg:order-1">
          <CardHeader>
            <CardDescription className="flex flex-wrap items-center gap-2">
              {p.isDraft ? (
                <Badge variant="outline">Bản nháp chưa lưu</Badge>
              ) : p.practiceCount ? (
                <span className="inline-flex items-center gap-1">
                  <RepeatIcon className="size-3.5" /> Đã luyện {p.practiceCount} lần
                </span>
              ) : (
                "Chưa luyện lần nào"
              )}
            </CardDescription>
            <CardTitle className="text-lg">{p.title}</CardTitle>
            <CardAction>
              <Button variant="outline" size="sm" onClick={p.onEdit}>
                <PencilIcon /> Sửa
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {parsed.lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Kịch bản chưa có câu thoại nào.</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {parsed.lines.map((line) => {
                  const mine = p.myRoles.includes(line.speaker);
                  return (
                    <li
                      key={line.id}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm leading-relaxed",
                        mine ? "bg-accent text-accent-foreground" : "bg-muted/50",
                      )}
                    >
                      <span className={cn("font-semibold", mine && "text-primary")}>{line.speaker}:</span> {line.text}
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Settings */}
        <Card className="order-1 min-w-0 lg:sticky lg:top-6 lg:order-2 lg:self-start">
          <CardHeader>
            <CardDescription className="truncate">{p.title}</CardDescription>
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
              <Slider
                min={50}
                max={100}
                step={5}
                value={[s.threshold]}
                onValueChange={([v]) => set({ threshold: v })}
              />
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
                id="show-translation"
                checked={s.showTranslation}
                onChange={(v) => set({ showTranslation: v })}
                label="Hiện nghĩa tiếng Việt"
                hint="Chrome dịch ngay trên máy, không tốn lượt AI (lần đầu tải gói Anh–Việt). Bật cùng chế độ “Ẩn” câu của bạn để luyện nhớ câu."
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
