import { MAX_IMPORT_BYTES, parseBackup } from "@/lib/backup";
import { dbError, getDb, toDbErrorResponse } from "@/lib/db/mongo.server";
import { importScripts } from "@/lib/db/scripts.server";

export const runtime = "nodejs";

/**
 * POST a backup (same format as the "Xuất" file, or a bare array of scripts)
 * → { added, updated, skipped, scripts }. Merges, never deletes.
 */
export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > MAX_IMPORT_BYTES) return dbError("bad_request", 413);
  const parsed = parseBackup(text);
  if (!parsed.ok) return Response.json({ error: "bad_request", message: parsed.error }, { status: 400 });
  try {
    const db = await getDb();
    if (!db) return dbError("db_not_configured", 503);
    return Response.json(await importScripts(db, parsed.scripts));
  } catch (err) {
    return toDbErrorResponse(err);
  }
}
