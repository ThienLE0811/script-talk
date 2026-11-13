"use client";

import { ExternalLinkIcon, KeyRoundIcon, MessagesSquareIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { aiErrorText, AiRequestError } from "@/lib/ai-errors";
import { newScriptId } from "@/lib/backup";
import type { ChatSession } from "@/lib/chat/history";
import { CUSTOM_TOPIC_ID, LEVELS, MAX_CUSTOM_TOPIC_LENGTH, TOPICS, type LevelId } from "@/lib/chat/prompts";
import { fetchChat } from "@/lib/chats-client";
import { loadJSON, saveJSON } from "@/lib/settings";
import { isRecognitionSupported, useEnglishVoices } from "@/lib/speech";
import { cn } from "@/lib/utils";
import Conversation from "./Conversation";
import RecentChats from "./RecentChats";

export type ChatSettings = {
  topicId: string;
  customTopic: string;
  level: LevelId;
  rate: number;
  voiceURI: string | null;
  /** Start each conversation with a mission (concrete goals to reach). */
  mission: boolean;
  /** "Tình huống khó": the AI now and then misunderstands, answers vaguely or raises a problem. */
  challenge: boolean;
  /** "Chỉ nghe": hide the AI's text so the learner listens instead of reading (a display preference). */
  listenOnly: boolean;
};

const K_CHAT_SETTINGS = "scripttalk.chat.settings";
const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  topicId: TOPICS[0].id,
  customTopic: "",
  level: "intermediate",
  rate: 0.95,
  voiceURI: null,
  mission: true,
  challenge: false,
  listenOnly: false,
};

/** The "natural conversation" mode: pick a topic, then talk freely with the AI. */
export default function ChatPractice({ configured }: { configured: boolean }) {
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_CHAT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"setup" | "chat">("setup");
  // The conversation being shown: a new one, or a saved one reopened from the history.
  const [session, setSession] = useState<{ id: string; initial?: ChatSession }>({ id: "" });
  const [opening, setOpening] = useState<string | null>(null);
  const [recSupported, setRecSupported] = useState<boolean | null>(null);
  const voices = useEnglishVoices();

  useEffect(() => {
    setSettings(loadJSON(K_CHAT_SETTINGS, DEFAULT_CHAT_SETTINGS));
    setRecSupported(isRecognitionSupported());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) saveJSON(K_CHAT_SETTINGS, settings);
  }, [settings, loaded]);

  const set = (patch: Partial<ChatSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const voiceURI =
    settings.voiceURI && voices.some((v) => v.voiceURI === settings.voiceURI)
      ? settings.voiceURI
      : voices[0]?.voiceURI;
  const canStart = settings.topicId !== CUSTOM_TOPIC_ID || settings.customTopic.trim().length > 0;

  const switchMode = (next: "setup" | "chat") => {
    setMode(next);
    window.scrollTo({ top: 0 });
  };

  const startNew = () => {
    setSession({ id: newScriptId() });
    switchMode("chat");
  };

  const openSaved = async (id: string) => {
    setOpening(id);
    try {
      const initial = await fetchChat(id);
      setSession({ id, initial });
      switchMode("chat");
    } catch (err) {
      toast.error("Chưa mở được buổi trò chuyện", {
        description: aiErrorText(err instanceof AiRequestError ? err.code : "network"),
      });
    } finally {
      setOpening(null);
    }
  };

  if (!configured) return <MissingKey />;

  if (mode === "chat") {
    const { initial } = session;
    return (
      <Conversation
        key={session.id}
        sessionId={session.id}
        initial={initial}
        // A reopened conversation keeps its own topic and level; voice and speed follow the current settings.
        settings={
          initial
            ? {
                ...settings,
                topicId: initial.topicId,
                customTopic: initial.customTopic ?? "",
                level: initial.level,
                challenge: initial.challenge ?? false,
              }
            : settings
        }
        voiceURI={voiceURI}
        recSupported={!!recSupported}
        onExit={() => switchMode("setup")}
        onToggleListenOnly={() => set({ listenOnly: !settings.listenOnly })}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Trò chuyện tự nhiên</h1>
        <p className="text-sm text-muted-foreground">
          Chọn một tình huống rồi nói chuyện tự do với AI. Sau mỗi câu bạn nói sẽ có góp ý ngữ pháp và cách diễn đạt.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <section>
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Chủ đề</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {[...TOPICS, { id: CUSTOM_TOPIC_ID, label: "Chủ đề khác…", emoji: "✏️" }].map((t) => {
              const active = settings.topicId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set({ topicId: t.id })}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left text-sm transition outline-none hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50",
                    active && "border-primary bg-accent text-accent-foreground ring-1 ring-primary",
                  )}
                >
                  <span className="text-xl" aria-hidden>
                    {t.emoji}
                  </span>
                  <span className="font-medium">{t.label}</span>
                </button>
              );
            })}
          </div>
          {settings.topicId === CUSTOM_TOPIC_ID && (
            <Input
              className="mt-3"
              value={settings.customTopic}
              maxLength={MAX_CUSTOM_TOPIC_LENGTH}
              onChange={(e) => set({ customTopic: e.target.value })}
              placeholder="Ví dụ: kể về kỳ nghỉ hè, bàn về phim yêu thích, mua sắm quần áo…"
              autoFocus
            />
          )}
        </section>

        <Card>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2.5 sm:col-span-2">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Trình độ</span>
              <ToggleGroup
                type="single"
                variant="outline"
                value={settings.level}
                onValueChange={(v) => v && set({ level: v as LevelId })}
                className="flex-wrap"
              >
                {LEVELS.map((l) => (
                  <ToggleGroupItem
                    key={l.id}
                    value={l.id}
                    className="rounded-full px-3 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {l.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="flex min-w-0 flex-col gap-2.5">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Giọng AI</span>
              <Select
                value={voiceURI ?? ""}
                onValueChange={(v) => set({ voiceURI: v })}
                disabled={voices.length === 0}
              >
                <SelectTrigger className="w-full min-w-0" aria-label="Giọng đọc của AI">
                  <SelectValue placeholder="Giọng mặc định" />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-72 max-w-[min(24rem,90vw)]">
                  {voices.map((v) => (
                    <SelectItem key={v.voiceURI} value={v.voiceURI}>
                      <span className="truncate">{v.name}</span>
                      <span className="text-xs text-muted-foreground">{v.lang}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tốc độ đọc</span>
                <span className="text-xs font-medium tabular-nums">{settings.rate.toFixed(2)}x</span>
              </div>
              <Slider
                min={0.6}
                max={1.3}
                step={0.05}
                value={[settings.rate]}
                onValueChange={([v]) => set({ rate: v })}
                className="mt-2"
              />
            </div>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="chat-mission"
                checked={settings.mission}
                onCheckedChange={(v) => set({ mission: v === true })}
                className="mt-0.5"
              />
              <div className="grid gap-0.5">
                <Label htmlFor="chat-mission" className="font-normal">
                  Nhận nhiệm vụ trong tình huống
                </Label>
                <span className="text-xs text-muted-foreground">
                  AI giao 3 mục tiêu cụ thể (ví dụ: đặt phòng 2 đêm, hỏi có bữa sáng không, xin giảm giá) và đánh dấu
                  khi bạn làm được.
                </span>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="chat-challenge"
                checked={settings.challenge}
                onCheckedChange={(v) => set({ challenge: v === true })}
                className="mt-0.5"
              />
              <div className="grid gap-0.5">
                <Label htmlFor="chat-challenge" className="font-normal">
                  Tình huống khó
                </Label>
                <span className="text-xs text-muted-foreground">
                  Thỉnh thoảng AI sẽ hiểu nhầm ý bạn, trả lời mơ hồ, hỏi bất ngờ hoặc gặp sự cố (hết hàng, hết phòng…)
                  như ngoài đời. Luyện cách sửa hiểu lầm và hỏi lại: “Sorry, I meant…”, “What do you mean by…?”
                </span>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="chat-listen-only"
                checked={settings.listenOnly}
                onCheckedChange={(v) => set({ listenOnly: v === true })}
                className="mt-0.5"
              />
              <div className="grid gap-0.5">
                <Label htmlFor="chat-listen-only" className="font-normal">
                  Chỉ nghe
                </Label>
                <span className="text-xs text-muted-foreground">
                  Ẩn chữ câu nói của AI để luyện nghe như ngoài đời. Không nghe kịp thì bấm “Hiện chữ” (phím T) hoặc
                  “Nghe lại”. Bật/tắt được ngay trong lúc trò chuyện.
                </span>
              </div>
            </div>
            {recSupported === false && (
              <p className="flex gap-2 text-xs text-amber-700 dark:text-amber-300">
                <TriangleAlertIcon className="size-4 shrink-0" />
                Trình duyệt này không hỗ trợ nhận giọng nói, bạn sẽ phải gõ câu trả lời. Nên dùng Chrome hoặc Edge.
              </p>
            )}
            <Button size="lg" disabled={!canStart} onClick={startNew}>
              <MessagesSquareIcon /> Bắt đầu trò chuyện
            </Button>
          </CardFooter>
        </Card>

        <RecentChats opening={opening} onOpen={(id) => void openSaved(id)} />
      </div>
    </div>
  );
}

function MissingKey() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <KeyRoundIcon className="size-5" />
          </div>
          <CardTitle className="text-lg">Cần cấu hình Gemini API key</CardTitle>
          <CardDescription>
            Chế độ trò chuyện dùng Gemini của Google để trả lời và góp ý. Key được giữ ở server, không gửi xuống trình
            duyệt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Tạo API key trong Google AI Studio. Nếu bạn có gói Google AI Pro, kích hoạt tín dụng Google Cloud ở trang
              My Benefits và gắn vào project của key.
            </li>
            <li>
              Tạo file <code className="rounded bg-muted px-1 py-0.5 text-[0.85em]">.env.local</code> ở thư mục gốc
              của dự án:
              <pre className="mt-2 overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs">GEMINI_API_KEY=key-của-bạn</pre>
            </li>
            <li>
              Khởi động lại dev server (<code className="rounded bg-muted px-1 py-0.5 text-[0.85em]">npm run dev</code>)
              rồi tải lại trang này.
            </li>
          </ol>
        </CardContent>
        <CardFooter>
          <Button asChild variant="outline">
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              Mở Google AI Studio <ExternalLinkIcon />
            </a>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
