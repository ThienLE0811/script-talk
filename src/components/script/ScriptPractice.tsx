"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2Icon, TriangleAlertIcon } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import Editor from "./Editor";
import GenerateScriptDialog from "./GenerateScriptDialog";
import Practice from "./Practice";
import PracticeSetup from "./PracticeSetup";
import ScriptLibrary from "./ScriptLibrary";
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
  recordScriptPractice,
  updateScript,
  type ImportSummary,
} from "@/lib/scripts-client";
import { isRecognitionSupported, useEnglishVoices } from "@/lib/speech";

const K_DRAFT = STORAGE_KEYS.draft;
const K_SETTINGS = STORAGE_KEYS.settings;
/** Where scripts were saved before the database existed; read only to migrate them. */
const K_LEGACY_SAVED = STORAGE_KEYS.saved;

export type SavedStatus = { state: "loading" } | { state: "ready" } | { state: "error"; code: string };

/**
 * Which screen is shown. It lives in the URL so the browser's Back button moves between screens:
 * /script (library), /script?edit (editor), /script?id=<id> (set-up), /script?id=<id>&play (practice).
 * `id` is a saved script id, or DRAFT_ID for the unsaved script in the editor.
 */
type Route =
  | { view: "library" }
  | { view: "edit" }
  | { view: "setup"; id: string }
  | { view: "practice"; id: string };

const DRAFT_ID = "draft";
const NEW_SCRIPT = "# \nA: \nB: \n";

function parseRoute(params: { get(key: string): string | null; has(key: string): boolean }): Route {
  if (params.has("edit")) return { view: "edit" };
  const id = params.get("id");
  if (!id) return { view: "library" };
  return params.has("play") ? { view: "practice", id } : { view: "setup", id };
}

function routeHref(r: Route): string {
  if (r.view === "edit") return "/script?edit";
  if (r.view === "setup") return `/script?id=${encodeURIComponent(r.id)}`;
  if (r.view === "practice") return `/script?id=${encodeURIComponent(r.id)}&play`;
  return "/script";
}

/** A running practice session: the whole script, or a subset when retrying missed lines. */
type Session = { id: string; script: ParsedScript; full: boolean; key: number };

/** The "practice from your own script" mode: library → set-up → spoken dialogue practice, plus the editor. */
export default function ScriptPractice() {
  const route = parseRoute(useSearchParams());
  // The editor's working copy (kept in localStorage as the draft).
  const [raw, setRaw] = useState(SAMPLE_SCRIPT);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState<SavedScript[]>([]);
  const [savedStatus, setSavedStatus] = useState<SavedStatus>({ state: "loading" });
  const [localOnly, setLocalOnly] = useState<SavedScript[]>([]);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  // Action waiting for "discard the unsaved draft?" confirmation.
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
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

  /* ---------- Navigation ---------- */

  // In-app history entries we pushed and the user has not gone back from yet.
  const pushedRef = useRef(0);
  useEffect(() => {
    const onPop = () => {
      pushedRef.current = Math.max(0, pushedRef.current - 1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (r: Route, replace = false) => {
    if (replace) {
      window.history.replaceState(null, "", routeHref(r));
    } else {
      window.history.pushState(null, "", routeHref(r));
      pushedRef.current++;
    }
    window.scrollTo({ top: 0 });
  };
  /** Back to the previous screen of this mode, or to `fallback` when the user arrived here directly. */
  const goBack = (fallback: Route) => {
    if (pushedRef.current > 0) window.history.back();
    else navigate(fallback, true);
  };

  // A practice URL without a running session (page reload, old history entry): show the set-up instead.
  const stalePracticeId = route.view === "practice" && session?.id !== route.id ? route.id : null;
  useEffect(() => {
    if (stalePracticeId) window.history.replaceState(null, "", routeHref({ view: "setup", id: stalePracticeId }));
  }, [stalePracticeId]);

  /* ---------- Draft (editor) ---------- */

  const ready = savedStatus.state === "ready";
  const draftParsed = useMemo(() => parseScript(raw), [raw]);
  const draftSaved = currentId ? saved.find((s) => s.id === currentId) : undefined;
  // Unsaved work: edits to a saved script (or one deleted elsewhere), or new non-empty content.
  const draftDirty = currentId
    ? ready && draftSaved?.raw !== raw
    : raw.trim() !== "" && raw !== SAMPLE_SCRIPT && raw !== NEW_SCRIPT;
  const draftTitle = draftParsed.title || draftParsed.lines[0]?.text.slice(0, 40) || "Kịch bản chưa có tiêu đề";

  /** Run `action`, first asking to discard the unsaved draft if there is one. */
  const guardDraft = (action: () => void) => {
    if (draftDirty) setPendingDiscard(() => action);
    else action();
  };

  /** Open the editor on `target` (a saved script, a new script or the sample). */
  const editScript = (target: { raw: string; id: string | null }) => {
    // Same script as the draft: continue the draft, keeping its unsaved edits.
    if (target.id && target.id === currentId) return navigate({ view: "edit" });
    guardDraft(() => {
      setRaw(target.raw);
      setCurrentId(target.id);
      navigate({ view: "edit" });
    });
  };

  /* ---------- Script being set up / practised ---------- */

  const activeId = route.view === "setup" || route.view === "practice" ? route.id : null;
  const activeSaved = activeId && activeId !== DRAFT_ID ? saved.find((s) => s.id === activeId) : undefined;
  const activeRaw = activeId === DRAFT_ID ? raw : (activeSaved?.raw ?? "");
  const activeParsed = useMemo(() => parseScript(activeRaw), [activeRaw]);

  const myRoles = useMemo(() => {
    const valid = settings.myRoles.filter((r) => activeParsed.speakers.includes(r));
    if (valid.length) return valid;
    const fallback = activeParsed.speakers[1] ?? activeParsed.speakers[0];
    return fallback ? [fallback] : [];
  }, [settings.myRoles, activeParsed.speakers]);

  // Pick a voice per machine speaker: the saved choice, or a different good voice for each.
  const voiceFor = (speaker: string): string | undefined => {
    const chosen = settings.voices[speaker];
    if (chosen && voices.some((v) => v.voiceURI === chosen)) return chosen;
    if (!voices.length) return undefined;
    const machine = activeParsed.speakers.filter((s) => !myRoles.includes(s));
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
      const title = draftParsed.title || draftParsed.lines[0]?.text.slice(0, 40) || "Kịch bản";
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

  const onGenerated = (script: GeneratedScript) => {
    setRaw(script.raw);
    setCurrentId(null);
    setSettings((s) => ({ ...s, myRoles: [script.learnerRole] }));
    if (route.view !== "edit") navigate({ view: "edit" });
    toast.success("AI đã viết xong kịch bản", {
      description: `${script.title} · bạn đóng vai ${script.learnerRole}. Bấm “Lưu” nếu muốn giữ lại.`,
    });
  };

  /* ---------- Practice ---------- */

  const startPractice = () => {
    if (!activeId) return;
    setSession((s) => ({ id: activeId, script: activeParsed, full: true, key: (s?.key ?? 0) + 1 }));
    navigate({ view: "practice", id: activeId });
  };

  /**
   * One finished run of the whole script: count it for the saved script being practised.
   * Retrying only the missed lines is not a full run, and unsaved drafts have nothing to count on.
   */
  const savedPracticed = session?.full && session.id !== DRAFT_ID ? saved.find((s) => s.id === session.id) : undefined;
  const onPracticeComplete = async () => {
    if (!savedPracticed) return;
    try {
      const updated = await recordScriptPractice(savedPracticed.id);
      setSaved((list) => list.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      if (errorCode(err) !== "not_found") showError("Chưa ghi được số lần luyện", err);
    }
  };

  /* ---------- Screens ---------- */

  const generateDialog = (
    <GenerateScriptDialog
      open={generateOpen}
      onOpenChange={setGenerateOpen}
      willReplace={draftDirty}
      onGenerated={onGenerated}
    />
  );
  const discardDialog = (
    <AlertDialog open={pendingDiscard !== null} onOpenChange={(open) => !open && setPendingDiscard(null)}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Bỏ bản nháp chưa lưu?</AlertDialogTitle>
          <AlertDialogDescription>
            “{draftTitle}” có thay đổi chưa lưu. Tiếp tục thì những thay đổi đó sẽ mất.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              pendingDiscard?.();
              setPendingDiscard(null);
            }}
          >
            Bỏ bản nháp
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (route.view === "practice" && session?.id === route.id) {
    return (
      <Practice
        key={session.key}
        script={session.script}
        myRoles={myRoles}
        settings={settings}
        voiceFor={voiceFor}
        recSupported={!!recSupported}
        onComplete={savedPracticed ? () => void onPracticeComplete() : undefined}
        practiceCount={savedPracticed?.practiceCount}
        onToggleTranslation={() => setSettings((s) => ({ ...s, showTranslation: !s.showTranslation }))}
        onExit={() => goBack({ view: "setup", id: session.id })}
        onRetryLines={(lineIndexes) => {
          setSession({
            ...session,
            script: buildRetryScript(session.script, myRoles, lineIndexes),
            full: false,
            key: session.key + 1, // remount Practice for a fresh session
          });
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  if (route.view === "setup" || route.view === "practice") {
    const id = route.id;
    const isDraft = id === DRAFT_ID;
    if (!isDraft && !activeSaved) {
      return (
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 py-16 text-center text-sm">
          {savedStatus.state === "loading" ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" /> Đang tải kịch bản…
            </p>
          ) : (
            <>
              <p className="flex gap-2 text-destructive">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                {savedStatus.state === "error"
                  ? aiErrorText(savedStatus.code)
                  : "Không tìm thấy kịch bản này. Có thể nó đã bị xoá."}
              </p>
              <div className="flex gap-2">
                {savedStatus.state === "error" && (
                  <Button variant="outline" onClick={() => void refreshSaved()}>
                    Thử lại
                  </Button>
                )}
                <Button onClick={() => navigate({ view: "library" }, true)}>Về thư viện</Button>
              </div>
            </>
          )}
        </div>
      );
    }
    return (
      <>
        <PracticeSetup
        title={isDraft ? draftTitle : (activeSaved?.title ?? "")}
        isDraft={isDraft}
        practiceCount={activeSaved?.practiceCount}
        parsed={activeParsed}
        myRoles={myRoles}
        settings={settings}
        onSettingsChange={setSettings}
        voices={voices}
        voiceFor={voiceFor}
        recSupported={recSupported}
        onStart={startPractice}
        onBack={() => goBack({ view: "library" })}
        onEdit={() =>
          isDraft ? navigate({ view: "edit" }) : activeSaved && editScript({ raw: activeSaved.raw, id: activeSaved.id })
        }
        />
        {discardDialog}
      </>
    );
  }

  if (route.view === "edit") {
    return (
      <>
        <Editor
          raw={raw}
          onRawChange={setRaw}
          parsed={draftParsed}
          isNew={!currentId}
          dirty={draftDirty}
          canSave={ready && !busy && draftParsed.lines.length > 0}
          onSave={() => void onSave()}
          onPractice={() => navigate({ view: "setup", id: currentId && !draftDirty ? currentId : DRAFT_ID })}
          onBack={() => goBack({ view: "library" })}
          onOpenGenerate={() => setGenerateOpen(true)}
        />
        {generateDialog}
      </>
    );
  }

  return (
    <>
      <ScriptLibrary
        saved={saved}
        savedStatus={savedStatus}
        onRetryLoad={() => void refreshSaved()}
        localOnlyCount={localOnly.length}
        onMigrateLocal={() => void onMigrateLocal()}
        busy={busy}
        sort={settings.savedSort}
        onSortChange={(savedSort) => setSettings((s) => ({ ...s, savedSort }))}
        draft={loaded && draftDirty ? { title: draftTitle } : null}
        onContinueDraft={() => navigate({ view: "edit" })}
        onDiscardDraft={() => {
          setRaw("");
          setCurrentId(null);
        }}
        onOpen={(id) => navigate({ view: "setup", id })}
        onEdit={(s) => editScript({ raw: s.raw, id: s.id })}
        onDelete={(id) => void onDelete(id)}
        onNew={() => editScript({ raw: NEW_SCRIPT, id: null })}
        onOpenSample={() => editScript({ raw: SAMPLE_SCRIPT, id: null })}
        onOpenGenerate={() => setGenerateOpen(true)}
        onExport={onExport}
        onImport={(file) => void onImport(file)}
      />
      {generateDialog}
      {discardDialog}
    </>
  );
}
