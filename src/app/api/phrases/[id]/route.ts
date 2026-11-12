import { dbError, getDb, toDbErrorResponse } from "@/lib/db/mongo.server";
import { deletePhrase, recordReview } from "@/lib/db/phrases.server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH { score, passed } → the phrase with its new review schedule. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const score = Number(body?.score);
  if (!Number.isFinite(score) || score < 0 || score > 100 || typeof body?.passed !== "boolean") {
    return dbError("bad_request", 400);
  }
  try {
    const db = await getDb();
    if (!db) return dbError("db_not_configured", 503);
    const phrase = await recordReview(db, id, score, body.passed);
    return phrase ? Response.json(phrase) : dbError("not_found", 404);
  } catch (err) {
    return toDbErrorResponse(err);
  }
}

/** DELETE → { ok: true }. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const db = await getDb();
    if (!db) return dbError("db_not_configured", 503);
    return (await deletePhrase(db, id)) ? Response.json({ ok: true }) : dbError("not_found", 404);
  } catch (err) {
    return toDbErrorResponse(err);
  }
}
