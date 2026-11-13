"use client";

import { useEffect, useState } from "react";

/* ---------------- Text to speech ---------------- */

function voiceRank(v: SpeechSynthesisVoice): number {
  let r = 0;
  if (/natural|neural|online/i.test(v.name)) r += 4;
  if (/google/i.test(v.name)) r += 3;
  if (v.lang.toLowerCase() === "en-us") r += 2;
  if (v.lang.toLowerCase() === "en-gb") r += 1;
  return r;
}

/** English voices available in this browser, best-sounding first. */
export function useEnglishVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const load = () =>
      setVoices(
        synth
          .getVoices()
          .filter((v) => v.lang.toLowerCase().startsWith("en"))
          .sort((a, b) => voiceRank(b) - voiceRank(a)),
      );
    load();
    synth.addEventListener("voiceschanged", load);
    return () => synth.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}

// Keep a reference so Chrome doesn't garbage-collect the utterance before `onend` fires.
let activeUtterance: SpeechSynthesisUtterance | null = null;

export function speak(text: string, opts: { voiceURI?: string; rate?: number } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || !text) return resolve();
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = synth.getVoices().find((v) => v.voiceURI === opts.voiceURI);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = "en-US";
    }
    u.rate = opts.rate ?? 1;
    activeUtterance = u;
    const done = () => {
      if (activeUtterance === u) activeUtterance = null;
      resolve();
    };
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
  });
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/* ---------------- Speech recognition ---------------- */

interface RecAlternative {
  transcript: string;
}
interface RecResult {
  isFinal: boolean;
  [i: number]: RecAlternative;
}
interface RecEvent {
  results: { length: number; [i: number]: RecResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  /** Fired when the recognizer detects speech (before any words are recognized). */
  onspeechstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isRecognitionSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export type ListenController = { stop: () => void; abort: () => void };

/**
 * Listen for one spoken line. Stops automatically after a short silence
 * (once something has been heard) or after `maxMs`.
 */
export function startListening(h: {
  onInterim: (text: string) => void;
  onDone: (text: string, error?: string) => void;
  /** Once, when the learner starts speaking (speech detected, or the first words if that comes first). */
  onSpeechStart?: () => void;
  silenceMs?: number;
  maxMs?: number;
}): ListenController {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    h.onDone("", "unsupported");
    return { stop() {}, abort() {} };
  }
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = "";
  let interimText = "";
  let error: string | undefined;
  let ended = false;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  const maxTimer = setTimeout(() => rec.stop(), h.maxMs ?? 25000);
  let speechStarted = false;
  const speechStart = () => {
    if (speechStarted) return;
    speechStarted = true;
    h.onSpeechStart?.();
  };

  rec.onspeechstart = speechStart;
  rec.onresult = (e) => {
    speechStart();
    let f = "";
    let it = "";
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) f += r[0].transcript + " ";
      else it += r[0].transcript + " ";
    }
    finalText = f;
    interimText = it;
    h.onInterim((f + it).replace(/\s+/g, " ").trim());
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => rec.stop(), h.silenceMs ?? 1600);
  };
  rec.onerror = (e) => {
    error = e.error;
  };
  rec.onend = () => {
    clearTimeout(silenceTimer);
    clearTimeout(maxTimer);
    if (ended) return;
    ended = true;
    h.onDone((finalText + " " + interimText).replace(/\s+/g, " ").trim(), error);
  };

  try {
    rec.start();
  } catch {
    ended = true;
    clearTimeout(maxTimer);
    h.onDone("", "start-failed");
  }

  return {
    stop: () => rec.stop(),
    abort: () => {
      ended = true;
      clearTimeout(silenceTimer);
      clearTimeout(maxTimer);
      rec.abort();
    },
  };
}
