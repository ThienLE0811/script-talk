/** Client-side calls to /api/scripts (saved scripts live in MongoDB). */
import { requestJSON } from "./ai-errors";
import type { SavedScript } from "./settings";

export type ImportSummary = { added: number; updated: number; skipped: number; scripts: SavedScript[] };

export const fetchScripts = () => requestJSON<SavedScript[]>("GET", "/api/scripts");

export const createScript = (title: string, raw: string) =>
  requestJSON<SavedScript>("POST", "/api/scripts", { title, raw });

export const updateScript = (id: string, title: string, raw: string) =>
  requestJSON<SavedScript>("PUT", `/api/scripts/${encodeURIComponent(id)}`, { title, raw });

export const deleteScript = (id: string) =>
  requestJSON<{ ok: true }>("DELETE", `/api/scripts/${encodeURIComponent(id)}`);

/** Send a backup (file text, or { scripts }) to be merged into the database. */
export const importScripts = (backup: string | { scripts: SavedScript[] }) =>
  requestJSON<ImportSummary>("POST", "/api/scripts/import", backup);
