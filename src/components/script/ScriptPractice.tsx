"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Editor from "./Editor";
import GenerateScriptDialog from "./GenerateScriptDialog";
import Practice from "./Practice";
import { aiErrorText, AiRequestError } from "@/lib/ai-errors";
import { backupFileName, buildBackup, MAX_IMPORT_BYTES, parseBackup } from "@/lib/backup";
import { parseScript, SAMPLE_SCRIPT, type ParsedScript } from "@/lib/script";
import type { GeneratedScript } from "@/lib/generate-script";
import { buildRetryScript } from "@/lib/practice";
import {
  DEFAULT_SETTINGS,
  loadArray,
  loadJSON,
  saveJSON,
  STORAGE_KEYS,
  type Draft,
  type SavedScript,
  type Settings,
} from "@/lib/settings";
import {
  createScript,
  deleteScript,
  fetchScripts,
  importScripts,
  updateScript,
  type ImportSummary,
} from "@/lib/scripts-client";
import { isRecognitionSupported, stopSpeaking, useEnglishVoices } from "@/lib/speech";

const K_DRAFT = STORAGE_KEYS.draft;
const K_SETTINGS = STORAGE_KEYS.settings;
/** Where scripts were saved before the database existed; read only to migrate them. */
const K_LEGACY_SAVED = STORAGE_KEYS.saved;

export type SavedStatus = { state: "loading" } | { state: "ready" } | { state: "error"; code: string };

/** The "practice from your own script" mode: editor + spoken dialogue practice. */
export default function ScriptPractice() {
  const [raw, setRaw] = useState(SAMPLE_SCRIPT);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState<SavedScript[]>([]);
  const [savedStatus, setSavedStatus] = useState<SavedStatus>({ state: "loading" });
  const [localOnly, setLocalOnly] = useState<SavedScript[]>([]);
  const [busy, setBusy] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "practice">("edit");
  // The script being practised: the whole script, or a subset when retrying missed lines.
  const [practiceScript, setPracticeScript] = useState<ParsedScript | null>(null);
  const [practiceKey, setPracticeKey] = useState(0);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [recSupported, setRecSupported] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const voices = useEnglishVoices();

  // Load persisted state after mount (localStorage is not available during SSR).
  useEffect(() => {
    const draft = loadJSON<Draft>(K_DRAFT, { raw: SAMPLE_SCRIPT, currentId: null });
    setRaw(draft.raw);
    setCurrentId(draft.currentId);
    setSettings(loadJSON(K_SETTINGS, DEFAULT_SETTINGS));
    setRecSupported(isRecognitionSupported());
    setLoaded(true);
    void refreshSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
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

  /* ---------- Saved scripts (MongoDB via /api/scripts) ---------- */

  const sortNewest = (list: SavedScript[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  const errorCode = (err: unknown) => (err instanceof AiRequestError ? err.code : "network");
  const showError = (title: string, err: unknown) =>
    toast.error(title, { description: (err as AiRequestError)?.detail ?? aiErrorText(errorCode(err)) });

  const refreshSaved = async () => {
    setSavedStatus({ state: "loading" });
    try {
      const list = await fetchScripts();
      setSaved(list);
      setSavedStatus({ state: "ready" });
      // Scripts saved in this browser before the database existed and not on the server yet.
      const legacy = loadArray<SavedScript>(K_LEGACY_SAVED);
      setLocalOnly(legacy.filter((l) => !list.some((s) => s.id === l.id && s.raw === l.raw)));
    } catch (err) {
      setSavedStatus({ state: "error", code: errorCode(err) });
    }
  };

  /** Run one save/delete/import at a time so double clicks cannot create duplicates. */
  const withBusy = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const onSave = () =>
    withBusy(async () => {
      const title = parsed.title || parsed.lines[0]?.text.slice(0, 40) || "Kịch bản";
      try {
        if (currentId && saved.some((s) => s.id === currentId)) {
          try {
            const updated = await updateScript(currentId, title, raw);
            setSaved((list) => sortNewest(list.map((s) => (s.id === updated.id ? updated : s))));
            toast.success("Đã lưu thay đổi", { description: title });
            return;
          } catch (err) {
            if (errorCode(err) !== "not_found") throw err;
            // Deleted on another device: save as a new script instead of losing the edit.
          }
        }
        const created = await createScript(title, raw);
        setSaved((list) => [created, ...list.filter((s) => s.id !== currentId)]);
        setCurrentId(created.id);
        toast.success("Đã lưu kịch bản", { description: title });
      } catch (err) {
        showError("Chưa lưu được kịch bản", err);
      }
    });

  const onDelete = (id: string) =>
    withBusy(async () => {
      try {
        await deleteScript(id);
      } catch (err) {
        if (errorCode(err) !== "not_found") {
          showError("Chưa xoá được kịch bản", err);
          return;
        }
      }
      setSaved((list) => list.filter((s) => s.id !== id));
      if (id === currentId) setCurrentId(null);
    });

  const announceImport = (r: ImportSummary) => {
    const parts = [
      r.added && `thêm ${r.added}`,
      r.updated && `cập nhật ${r.updated}`,
      r.skipped && `bỏ qua ${r.skipped} bản đã có`,
    ].filter(Boolean);
    if (r.added || r.updated) toast.success("Đã nhập kịch bản", { description: parts.join(", ") });
    else toast.info("Không có gì mới", { description: "Tất cả kịch bản đều đã có sẵn." });
  };

  const onMigrateLocal = () =>
    withBusy(async () => {
      try {
        const res = await importScripts({ scripts: loadArray<SavedScript>(K_LEGACY_SAVED) });
        setSaved(res.scripts);
        setLocalOnly([]);
        try {
          localStorage.removeItem(K_LEGACY_SAVED); // now safely on the server
        } catch {
          /* ignore */
        }
        announceImport(res);
      } catch (err) {
        showError("Chưa chuyển được kịch bản lên server", err);
      }
    });

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

  const onImport = (file: File) =>
    withBusy(async () => {
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
      // Check locally first for a clear message; the server validates again.
      const check = parseBackup(text);
      if (!check.ok) {
        toast.error("Không nhập được kịch bản", { description: check.error });
        return;
      }
      try {
        const res = await importScripts(text);
        setSaved(res.scripts);
        announceImport(res);
      } catch (err) {
        showError("Không nhập được kịch bản", err);
      }
    });

  const switchMode = (next: "edit" | "practice") => {
    if (next === "edit") stopSpeaking();
    else setPracticeScript(parsed);
    setMode(next);
    window.scrollTo({ top: 0 });
  };

  const onGenerated = (script: GeneratedScript) => {
    setRaw(script.raw);
    setCurrentId(null);
    setSettings((s) => ({ ...s, myRoles: [script.learnerRole] }));
    toast.success("AI đã viết xong kịch bản", {
      description: `${script.title} · bạn đóng vai ${script.learnerRole}. Bấm “Lưu kịch bản” nếu muốn giữ lại.`,
    });
  };

  if (mode === "practice" && practiceScript) {
    return (
      <Practice
        key={practiceKey}
        script={practiceScript}
        myRoles={myRoles}
        settings={settings}
        voiceFor={voiceFor}
        recSupported={!!recSupported}
        onExit={() => switchMode("edit")}
        onRetryLines={(lineIndexes) => {
          setPracticeScript(buildRetryScript(practiceScript, myRoles, lineIndexes));
          setPracticeKey((k) => k + 1); // remount Practice for a fresh session
          window.scrollTo({ top: 0 });
        }}
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
        savedStatus={savedStatus}
        onRetryLoad={() => void refreshSaved()}
        localOnlyCount={localOnly.length}
        onMigrateLocal={() => void onMigrateLocal()}
        busy={busy}
        currentId={currentId}
        onSave={() => void onSave()}
        onExport={onExport}
        onImport={(file) => void onImport(file)}
        onLoad={(s) => {
          setRaw(s.raw);
          setCurrentId(s.id);
        }}
        onDelete={(id) => void onDelete(id)}
        onNew={() => {
          setRaw("# \nA: \nB: \n");
          setCurrentId(null);
        }}
        onStart={() => switchMode("practice")}
        onOpenGenerate={() => setGenerateOpen(true)}
        recSupported={recSupported}
      />
      <GenerateScriptDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        willReplace={raw.trim().length > 0 && raw !== SAMPLE_SCRIPT}
        onGenerated={onGenerated}
      />
    </div>
  );
}
