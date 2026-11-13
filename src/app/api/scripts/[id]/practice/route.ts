import { dbError, getDb, toDbErrorResponse } from "@/lib/db/mongo.server";
import { recordPractice } from "@/lib/db/scripts.server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST → the SavedScript with its practice count increased by one. */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const db = await getDb();
    if (!db) return dbError("db_not_configured", 503);
    const script = await recordPractice(db, id);
    return script ? Response.json(script) : dbError("not_found", 404);
  } catch (err) {
    return toDbErrorResponse(err);
  }
}
