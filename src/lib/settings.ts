import { newScriptId } from "./backup";

export type LineMode = "full" | "hint" | "hidden";

export type Settings = {
  myRoles: string[];
  voices: Record<string, string>;
  rate: number;
  myLineMode: LineMode;
  showPartnerText: boolean;
  threshold: number;
  autoAdvance: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  myRoles: ["B"],
  voices: {},
  rate: 0.95,
  myLineMode: "full",
  showPartnerText: true,
  threshold: 80,
  autoAdvance: true,
};

export type SavedScript = { id: string; title: string; raw: string; updatedAt: number };

/** Every localStorage key the app uses. Changing a value's shape needs a migration. */
export const STORAGE_KEYS = {
  draft: "scripttalk.draft",
  settings: "scripttalk.settings",
  saved: "scripttalk.saved",
  chatSettings: "scripttalk.chat.settings",
  generate: "scripttalk.generate",
} as const;

export type Draft = { raw: string; currentId: string | null };

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}

export function loadArray<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: ignore */
  }
}

/** Add a script to the saved list from outside the script editor (e.g. the chat mode). */
export function addSavedScript(title: string, raw: string): SavedScript {
  const script: SavedScript = { id: newScriptId(), title, raw, updatedAt: Date.now() };
  saveJSON(STORAGE_KEYS.saved, [script, ...loadArray<SavedScript>(STORAGE_KEYS.saved)]);
  return script;
}

/** Make the script editor open `script` next time it mounts, with `myRole` as the learner's role. */
export function queueScriptForPractice(script: SavedScript, myRole: string) {
  saveJSON(STORAGE_KEYS.draft, { raw: script.raw, currentId: script.id } satisfies Draft);
  const settings = loadJSON(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  saveJSON(STORAGE_KEYS.settings, { ...settings, myRoles: [myRole] });
}
