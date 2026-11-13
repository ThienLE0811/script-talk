export type LineMode = "full" | "hint" | "hidden";

export type Settings = {
  myRoles: string[];
  voices: Record<string, string>;
  rate: number;
  myLineMode: LineMode;
  showPartnerText: boolean;
  threshold: number;
  autoAdvance: boolean;
  /** Vietnamese subtitle under each line (translated on the device, see lib/translate.ts). */
  showTranslation: boolean;
  /** Order of the saved scripts list. */
  savedSort: SavedSort;
};

export const DEFAULT_SETTINGS: Settings = {
  myRoles: ["B"],
  voices: {},
  rate: 0.95,
  myLineMode: "full",
  showPartnerText: true,
  threshold: 80,
  autoAdvance: true,
  showTranslation: false,
  savedSort: "updated",
};

export type SavedScript = {
  id: string;
  title: string;
  raw: string;
  updatedAt: number;
  /** Completed full practice runs (counted on the server; not part of the backup file). */
  practiceCount?: number;
  lastPracticedAt?: number;
};

export type SavedSort = "updated" | "least" | "recent";

export const SAVED_SORTS: { value: SavedSort; label: string }[] = [
  { value: "updated", label: "Mới sửa" },
  { value: "least", label: "Ít luyện nhất" },
  { value: "recent", label: "Luyện gần đây" },
];

/**
 * Saved scripts in the chosen order (unknown values fall back to "updated"):
 * - updated: last edited first;
 * - least: fewest practice runs first, then the one practised longest ago, so neglected scripts surface;
 * - recent: last practised first, never-practised ones at the end.
 * Ties keep the last-edited-first order.
 */
export function sortSavedScripts(list: SavedScript[], order: SavedSort): SavedScript[] {
  const count = (s: SavedScript) => s.practiceCount ?? 0;
  const last = (s: SavedScript) => s.lastPracticedAt ?? 0;
  const byPractice = (a: SavedScript, b: SavedScript) => {
    if (order === "least") return count(a) - count(b) || last(a) - last(b);
    if (order === "recent") return last(b) - last(a);
    return 0;
  };
  return [...list].sort((a, b) => byPractice(a, b) || b.updatedAt - a.updatedAt);
}

/** Every localStorage key the app uses. Changing a value's shape needs a migration. */
export const STORAGE_KEYS = {
  draft: "scripttalk.draft",
  settings: "scripttalk.settings",
  /** Legacy: saved scripts before MongoDB. Only read to migrate them, then removed. */
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

/** Make the script editor open `script` next time it mounts, with `myRole` as the learner's role. */
export function queueScriptForPractice(script: SavedScript, myRole: string) {
  saveJSON(STORAGE_KEYS.draft, { raw: script.raw, currentId: script.id } satisfies Draft);
  const settings = loadJSON(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  saveJSON(STORAGE_KEYS.settings, { ...settings, myRoles: [myRole] });
}
