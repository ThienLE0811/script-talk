/**
 * Export / import of saved scripts as a JSON file. Pure logic: no DOM, no localStorage.
 * The file format is a contract with users (they keep these files), so keep it backward compatible.
 */
import type { SavedScript } from "./settings";

export const BACKUP_APP = "scripttalk";
export const BACKUP_TYPE = "scripts";
export const BACKUP_VERSION = 1;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_RAW_LENGTH = 100_000;

export type ScriptBackup = {
  app: typeof BACKUP_APP;
  type: typeof BACKUP_TYPE;
  version: number;
  exportedAt: string;
  scripts: SavedScript[];
};

export function newScriptId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function buildBackup(scripts: SavedScript[], now = new Date()): ScriptBackup {
  return { app: BACKUP_APP, type: BACKUP_TYPE, version: BACKUP_VERSION, exportedAt: now.toISOString(), scripts };
}

/** "scripttalk-kich-ban-2026-11-12.json" */
export function backupFileName(now = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `scripttalk-kich-ban-${d}.json`;
}

export type ImportResult = { ok: true; scripts: SavedScript[] } | { ok: false; error: string };

function titleFromRaw(raw: string): string {
  const heading = raw.match(/^\s*#+\s*(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 80);
  const first = raw.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";
  return first.replace(/^[^:]{1,25}:\s*/, "").slice(0, 40) || "Kịch bản";
}

/**
 * Parse a backup file. Accepts the full backup object or a bare array of scripts
 * (`{ raw, title?, id?, updatedAt? }`), so hand-written files work too.
 */
export function parseBackup(text: string, now = Date.now()): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { ok: false, error: "File không phải JSON hợp lệ." };
  }

  let items: unknown;
  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === "object" && Array.isArray((data as { scripts?: unknown }).scripts)) {
    const d = data as { app?: unknown; version?: unknown; scripts: unknown[] };
    if (d.app !== undefined && d.app !== BACKUP_APP) return { ok: false, error: "File này không phải của ScriptTalk." };
    if (typeof d.version === "number" && d.version > BACKUP_VERSION) {
      return { ok: false, error: "File được tạo bởi phiên bản ScriptTalk mới hơn. Hãy cập nhật ứng dụng." };
    }
    items = d.scripts;
  } else {
    return { ok: false, error: "Không tìm thấy danh sách kịch bản trong file." };
  }

  const scripts: SavedScript[] = [];
  for (const item of items as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const s = item as Partial<Record<keyof SavedScript, unknown>>;
    if (typeof s.raw !== "string" || !s.raw.trim()) continue;
    const raw = s.raw.slice(0, MAX_RAW_LENGTH);
    scripts.push({
      id: typeof s.id === "string" && s.id ? s.id : newScriptId() + scripts.length,
      title: typeof s.title === "string" && s.title.trim() ? s.title.trim().slice(0, 120) : titleFromRaw(raw),
      raw,
      updatedAt: typeof s.updatedAt === "number" && Number.isFinite(s.updatedAt) ? s.updatedAt : now,
    });
  }
  if (!scripts.length) return { ok: false, error: "File không có kịch bản nào dùng được." };
  return { ok: true, scripts };
}

export type MergeResult = { list: SavedScript[]; added: number; updated: number; skipped: number };

/**
 * Merge imported scripts into the existing list without losing anything:
 * - same id: keep whichever was edited more recently (re-importing your own export is a no-op);
 * - same content under another id: skip (already have it);
 * - otherwise: add.
 */
export function mergeScripts(existing: SavedScript[], incoming: SavedScript[]): MergeResult {
  const list = [...existing];
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const s of incoming) {
    const sameId = list.findIndex((e) => e.id === s.id);
    if (sameId >= 0) {
      const cur = list[sameId];
      if (cur.raw === s.raw && cur.title === s.title) skipped++;
      else if (s.updatedAt > cur.updatedAt) {
        list[sameId] = s;
        updated++;
      } else skipped++;
      continue;
    }
    if (list.some((e) => e.raw === s.raw)) {
      skipped++;
      continue;
    }
    list.push(s);
    added++;
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  return { list, added, updated, skipped };
}
