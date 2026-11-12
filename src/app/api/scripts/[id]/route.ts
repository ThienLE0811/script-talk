import { dbError, getDb, toDbErrorResponse } from "@/lib/db/mongo.server";
import { deleteScript, readScriptInput, updateScript } from "@/lib/db/scripts.server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** PUT { title, raw } → the updated SavedScript. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const input = readScriptInput(await req.json().catch(() => null));
  if (!input) return dbError("bad_request", 400);
  try {
    const db = await getDb();
    if (!db) return dbError("db_not_configured", 503);
    const script = await updateScript(db, id, input);
    return script ? Response.json(script) : dbError("not_found", 404);
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
    return (await deleteScript(db, id)) ? Response.json({ ok: true }) : dbError("not_found", 404);
  } catch (err) {
    return toDbErrorResponse(err);
  }
}
