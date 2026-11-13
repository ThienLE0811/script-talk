// Server-only data access for saved scripts.
import type { Collection, Db } from "mongodb";
import { mergeScripts, newScriptId } from "@/lib/backup";
import type { SavedScript } from "@/lib/settings";

/** Stored document. `_id` is the app's script id (string), so ids stay stable across export/import. */
type ScriptDoc = {
  _id: string;
  title: string;
  raw: string;
  createdAt: number;
  updatedAt: number;
  practiceCount?: number;
  lastPracticedAt?: number;
};

export const MAX_TITLE_LENGTH = 120;
export const MAX_RAW_LENGTH = 100_000;

// Create indexes once per process (client.db() returns a new Db object each call, so key on the process).
let indexesReady: Promise<unknown> | null = null;

async function scripts(db: Db): Promise<Collection<ScriptDoc>> {
  const col = db.collection<ScriptDoc>("scripts");
  indexesReady ??= col.createIndex({ updatedAt: -1 }).catch((err) => {
    indexesReady = null;
    throw err;
  });
  await indexesReady;
  return col;
}

const toScript = (d: ScriptDoc): SavedScript => ({
  id: d._id,
  title: d.title,
  raw: d.raw,
  updatedAt: d.updatedAt,
  ...(d.practiceCount ? { practiceCount: d.practiceCount, lastPracticedAt: d.lastPracticedAt } : {}),
});

/** Validate a { title, raw } payload. Returns null when unusable. */
export function readScriptInput(body: unknown): { title: string; raw: string } | null {
  if (!body || typeof body !== "object") return null;
  const { title, raw } = body as { title?: unknown; raw?: unknown };
  if (typeof raw !== "string" || !raw.trim() || raw.length > MAX_RAW_LENGTH) return null;
  const t = typeof title === "string" && title.trim() ? title.trim().slice(0, MAX_TITLE_LENGTH) : "Kịch bản";
  return { title: t, raw };
}

export async function listScripts(db: Db): Promise<SavedScript[]> {
  const docs = await (await scripts(db)).find().sort({ updatedAt: -1 }).toArray();
  return docs.map(toScript);
}

export async function createScript(db: Db, input: { title: string; raw: string }): Promise<SavedScript> {
  const now = Date.now();
  const doc: ScriptDoc = { _id: newScriptId(), title: input.title, raw: input.raw, createdAt: now, updatedAt: now };
  await (await scripts(db)).insertOne(doc);
  return toScript(doc);
}

export async function updateScript(db: Db, id: string, input: { title: string; raw: string }): Promise<SavedScript | null> {
  const doc = await (await scripts(db)).findOneAndUpdate(
    { _id: id },
    { $set: { title: input.title, raw: input.raw, updatedAt: Date.now() } },
    { returnDocument: "after" },
  );
  return doc ? toScript(doc) : null;
}

/**
 * Count one completed practice run. Leaves `updatedAt` alone: practising is not editing,
 * so the saved list keeps its order.
 */
export async function recordPractice(db: Db, id: string): Promise<SavedScript | null> {
  const doc = await (await scripts(db)).findOneAndUpdate(
    { _id: id },
    { $inc: { practiceCount: 1 }, $set: { lastPracticedAt: Date.now() } },
    { returnDocument: "after" },
  );
  return doc ? toScript(doc) : null;
}

export async function deleteScript(db: Db, id: string): Promise<boolean> {
  const res = await (await scripts(db)).deleteOne({ _id: id });
  return res.deletedCount === 1;
}

/**
 * Merge scripts into the database with the same rules as the JSON import (see mergeScripts):
 * same id keeps the newer copy, identical content is skipped, the rest is added. Never deletes.
 */
export async function importScripts(db: Db, incoming: SavedScript[]) {
  const col = await scripts(db);
  const existing = (await col.find().toArray()).map(toScript);
  const result = mergeScripts(existing, incoming);
  const before = new Map(existing.map((s) => [s.id, s]));
  const changed = result.list.filter((s) => {
    const old = before.get(s.id);
    return !old || old.raw !== s.raw || old.title !== s.title || old.updatedAt !== s.updatedAt;
  });
  if (changed.length) {
    await col.bulkWrite(
      changed.map((s) => ({
        updateOne: {
          filter: { _id: s.id },
          update: {
            $set: { title: s.title.slice(0, MAX_TITLE_LENGTH), raw: s.raw.slice(0, MAX_RAW_LENGTH), updatedAt: s.updatedAt },
            $setOnInsert: { createdAt: Date.now() },
          },
          upsert: true,
        },
      })),
    );
  }
  return { added: result.added, updated: result.updated, skipped: result.skipped, scripts: result.list };
}
