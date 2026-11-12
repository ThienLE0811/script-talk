import { dbError, getDb, toDbErrorResponse } from "@/lib/db/mongo.server";
import { createScript, listScripts, readScriptInput } from "@/lib/db/scripts.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → SavedScript[] (newest first). */
export async function GET() {
  try {
    const db = await getDb();
    if (!db) return dbError("db_not_configured", 503);
    return Response.json(await listScripts(db), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return toDbErrorResponse(err);
  }
}

/** POST { title, raw } → the created SavedScript. */
export async function POST(req: Request) {
  const input = readScriptInput(await req.json().catch(() => null));
  if (!input) return dbError("bad_request", 400);
  try {
    const db = await getDb();
    if (!db) return dbError("db_not_configured", 503);
    return Response.json(await createScript(db, input), { status: 201 });
  } catch (err) {
    return toDbErrorResponse(err);
  }
}
