import { listChats } from "@/lib/db/chats.server";
import { dbError, getDb, toDbErrorResponse } from "@/lib/db/mongo.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → ChatSessionMeta[] (most recent first, without transcripts). */
export async function GET() {
  try {
    const db = await getDb();
    if (!db) return dbError("db_not_configured", 503);
    return Response.json(await listChats(db), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return toDbErrorResponse(err);
  }
}
