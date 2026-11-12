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
