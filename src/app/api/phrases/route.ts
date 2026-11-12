import { dbError, getDb, toDbErrorResponse } from "@/lib/db/mongo.server";
import { addPhrases, listPhrases } from "@/lib/db/phrases.server";
import { readNewPhrase } from "@/lib/phrasebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 50;

/** GET → Phrase[] (due first). */
export async function GET() {
  try {
    const db = await getDb();
    if (!db) return dbError("db_not_configured", 503);
    return Response.json(await listPhrases(db), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return toDbErrorResponse(err);
  }
}

/** POST { items: NewPhrase[] } → { added, existing }. Duplicates (same normalised text) are skipped. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const raw: unknown[] = Array.isArray(body?.items) ? body.items.slice(0, MAX_BATCH) : [];
  const items = raw.map(readNewPhrase).filter((p) => p !== null);
  if (!items.length) return dbError("bad_request", 400);
  try {
    const db = await getDb();
    if (!db) return dbError("db_not_configured", 503);
    return Response.json(await addPhrases(db, items));
  } catch (err) {
    return toDbErrorResponse(err);
  }
}
