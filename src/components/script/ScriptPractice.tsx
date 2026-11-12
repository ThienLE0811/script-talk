"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Editor from "./Editor";
import Practice from "./Practice";
import { backupFileName, buildBackup, MAX_IMPORT_BYTES, mergeScripts, newScriptId, parseBackup } from "@/lib/backup";
import { parseScript, SAMPLE_SCRIPT } from "@/lib/script";
import { DEFAULT_SETTINGS, loadArray, loadJSON, saveJSON, type SavedScript, type Settings } from "@/lib/settings";
import { isRecognitionSupported, stopSpeaking, useEnglishVoices } from "@/lib/speech";

const K_DRAFT = "scripttalk.draft";
const K_SETTINGS = "scripttalk.settings";
const K_SAVED = "scripttalk.saved";

/** The "practice from your own script" mode: editor + spoken dialogue practice. */
export default function ScriptPractice() {
  const [raw, setRaw] = useState(SAMPLE_SCRIPT);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState<SavedScript[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "practice">("edit");
  const [recSupported, setRecSupported] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const voices = useEnglishVoices();

  // Load persisted state after mount (localStorage is not available during SSR).
  useEffect(() => {
    const draft = loadJSON<{ raw: string; currentId: string | null }>(K_DRAFT, { raw: SAMPLE_SCRIPT, currentId: null });
    setRaw(draft.raw);
    setCurrentId(draft.currentId);
    setSettings(loadJSON(K_SETTINGS, DEFAULT_SETTINGS));
    setSaved(loadArray<SavedScript>(K_SAVED));
    setRecSupported(isRecognitionSupported());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveJSON(K_DRAFT, { raw, currentId });
  }, [raw, currentId, loaded]);
  useEffect(() => {
    if (loaded) saveJSON(K_SETTINGS, settings);
  }, [settings, loaded]);

  const parsed = useMemo(() => parseScript(raw), [raw]);

  const myRoles = useMemo(() => {
    const valid = settings.myRoles.filter((r) => parsed.speakers.includes(r));
    if (valid.length) return valid;
    const fallback = parsed.speakers[1] ?? parsed.speakers[0];
    return fallback ? [fallback] : [];
  }, [settings.myRoles, parsed.speakers]);

  // Pick a voice per machine speaker: the saved choice, or a different good voice for each.
  const voiceFor = (speaker: string): string | undefined => {
    const chosen = settings.voices[speaker];
    if (chosen && voices.some((v) => v.voiceURI === chosen)) return chosen;
    if (!voices.length) return undefined;
    const machine = parsed.speakers.filter((s) => !myRoles.includes(s));
    const k = Math.max(0, machine.indexOf(speaker));
    return voices[k % voices.length].voiceURI;
  };

  const persistSaved = (list: SavedScript[]) => {
    setSaved(list);
    saveJSON(K_SAVED, list);
  };

  const onSave = () => {
    const title = parsed.title || parsed.lines[0]?.text.slice(0, 40) || "Kịch bản";
    const now = Date.now();
    if (currentId && saved.some((s) => s.id === currentId)) {
      persistSaved(
        saved
          .map((s) => (s.id === currentId ? { ...s, title, raw, updatedAt: now } : s))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
      toast.success("Đã lưu thay đổi", { description: title });
    } else {
      const id = newScriptId();
      persistSaved([{ id, title, raw, updatedAt: now }, ...saved]);
      setCurrentId(id);
      toast.success("Đã lưu kịch bản", { description: title });
    }
  };

  const onExport = () => {
    if (!saved.length) return;
    const blob = new Blob([JSON.stringify(buildBackup(saved), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`Đã xuất ${saved.length} kịch bản`, { description: a.download });
  };

  const onImport = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error("File quá lớn", { description: "Giới hạn 2 MB." });
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.error("Không đọc được file");
      return;
    }
    const parsedFile = parseBackup(text);
    if (!parsedFile.ok) {
      toast.error("Không nhập được kịch bản", { description: parsedFile.error });
      return;
    }
    const { list, added, updated, skipped } = mergeScripts(saved, parsedFile.scripts);
    persistSaved(list);
    const parts = [
      added && `thêm ${added}`,
      updated && `cập nhật ${updated}`,
      skipped && `bỏ qua ${skipped} bản đã có`,
    ].filter(Boolean);
    if (added || updated) toast.success("Đã nhập kịch bản", { description: parts.join(", ") });
    else toast.info("Không có gì mới", { description: "Tất cả kịch bản trong file đều đã có sẵn." });
  };

  const switchMode = (next: "edit" | "practice") => {
    if (next === "edit") stopSpeaking();
    setMode(next);
    window.scrollTo({ top: 0 });
  };

  if (mode === "practice") {
    return (
      <Practice
        script={parsed}
        myRoles={myRoles}
        settings={settings}
        voiceFor={voiceFor}
        recSupported={!!recSupported}
        onExit={() => switchMode("edit")}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Luyện theo kịch bản</h1>
        <p className="text-sm text-muted-foreground">
          Viết kịch bản, chọn vai của bạn. Máy đọc các vai còn lại, bạn nói phần của mình và được chấm từng từ.
        </p>
      </div>

      <Editor
        raw={raw}
        onRawChange={setRaw}
        parsed={parsed}
        myRoles={myRoles}
        settings={settings}
        onSettingsChange={setSettings}
        voices={voices}
        voiceFor={voiceFor}
        saved={saved}
        currentId={currentId}
        onSave={onSave}
        onExport={onExport}
        onImport={onImport}
        onLoad={(s) => {
          setRaw(s.raw);
          setCurrentId(s.id);
        }}
        onDelete={(id) => {
          persistSaved(saved.filter((s) => s.id !== id));
          if (id === currentId) setCurrentId(null);
        }}
        onNew={() => {
          setRaw("# \nA: \nB: \n");
          setCurrentId(null);
        }}
        onStart={() => switchMode("practice")}
        recSupported={recSupported}
      />
    </div>
  );
}
