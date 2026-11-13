"use client";
/**
 * Vietnamese subtitles with the browser's built-in Translator API (Chrome desktop 138+).
 * Translation runs on the device: no server, no AI quota. The English→Vietnamese language pack is
 * downloaded once by the browser; starting that download needs a user click (transient activation).
 */
import { useEffect, useRef, useState } from "react";

type Availability = "unavailable" | "downloadable" | "downloading" | "available";
type BrowserTranslator = { translate(text: string): Promise<string> };
type TranslatorApi = {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(opts: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: EventTarget) => void;
  }): Promise<BrowserTranslator>;
};

const PAIR = { sourceLanguage: "en", targetLanguage: "vi" } as const;

function translatorApi(): TranslatorApi | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Translator?: TranslatorApi }).Translator ?? null;
}

/** "unsupported": the browser has no Translator API at all. */
export async function translatorAvailability(): Promise<Availability | "unsupported"> {
  const api = translatorApi();
  if (!api) return "unsupported";
  try {
    return await api.availability(PAIR);
  } catch {
    return "unavailable";
  }
}

// One translator per page, shared by every practice session; the latest caller gets progress updates.
let shared: Promise<BrowserTranslator> | null = null;
let onDownloadProgress: ((fraction: number) => void) | null = null;

function getTranslator(onProgress: (fraction: number) => void): Promise<BrowserTranslator> {
  onDownloadProgress = onProgress;
  const api = translatorApi();
  if (!api) return Promise.reject(new Error("unsupported"));
  shared ??= api
    .create({
      ...PAIR,
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          const { loaded, total } = e as ProgressEvent;
          onDownloadProgress?.(total > 1 ? loaded / total : loaded);
        });
      },
    })
    .catch((err) => {
      shared = null; // allow another try (for example after a click)
      throw err;
    });
  return shared;
}

// Lines repeat across sessions ("Luyện lại cả bài", retrying missed lines): translate each once per page.
const cache = new Map<string, string>();

/** Translate texts one by one (cached), reporting each; false when stopped because `alive()` turned false. */
async function translateEach(
  translator: BrowserTranslator,
  texts: string[],
  alive: () => boolean,
  onEach: (text: string, vi: string) => void,
): Promise<boolean> {
  for (const text of texts) {
    if (!cache.has(text)) cache.set(text, (await translator.translate(text)).trim());
    if (!alive()) return false;
    onEach(text, cache.get(text)!);
  }
  return true;
}

/** Downloading the language pack needs a recent click; without one Chrome rejects with NotAllowedError. */
const downloadNeedsClick = (availability: Availability, err: unknown) =>
  availability !== "available" && err instanceof Error && err.name === "NotAllowedError";

export type TranslationStatus =
  | "idle"
  | "unsupported" // no Translator API in this browser
  | "unavailable" // the browser cannot translate English → Vietnamese
  | "needs-download" // language pack not on the device yet: needs a click to download
  | "downloading"
  | "translating"
  | "ready"
  | "error";

/**
 * Vietnamese translations of `texts` while `enabled`: a map from English text to Vietnamese, filled
 * line by line. The language pack download is tried right away (the practice screen opens from a
 * click, which usually still counts as user activation); if the browser refuses without a click, the
 * status becomes "needs-download" and `retry()` should be called from a click handler.
 */
export function useViTranslations(texts: string[], enabled: boolean) {
  const [status, setStatus] = useState<TranslationStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [vi, setVi] = useState<Record<string, string>>({});
  const runRef = useRef(0);
  const key = JSON.stringify([...new Set(texts.map((t) => t.trim()).filter(Boolean))]);

  const start = async () => {
    const id = ++runRef.current;
    const alive = () => runRef.current === id;
    const todo = JSON.parse(key) as string[];
    setVi(Object.fromEntries(todo.filter((t) => cache.has(t)).map((t) => [t, cache.get(t)!])));
    if (todo.every((t) => cache.has(t))) return setStatus("ready");

    const availability = await translatorAvailability();
    if (!alive()) return;
    if (availability === "unsupported" || availability === "unavailable") return setStatus(availability);
    setStatus(availability === "available" ? "translating" : "downloading");
    setProgress(0);
    try {
      const translator = await getTranslator((p) => alive() && setProgress(p));
      if (alive()) setStatus("translating");
      const done = await translateEach(translator, todo, alive, (text, v) => setVi((m) => ({ ...m, [text]: v })));
      if (done) setStatus("ready");
    } catch (err) {
      if (alive()) setStatus(downloadNeedsClick(availability, err) ? "needs-download" : "error");
    }
  };

  useEffect(() => {
    if (!enabled) return;
    void start();
    return () => {
      // runRef is a plain counter (not a DOM ref): bumping it stops this run from updating state.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      runRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the texts
  }, [enabled, key]);

  return {
    status: enabled ? status : "idle",
    progress,
    vi,
    /** Try again; call from a click handler so a language pack download is allowed. */
    retry: () => void start(),
  };
}
