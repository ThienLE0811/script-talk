import { isChatId, readChatSessionInput } from "@/lib/chat/history";
import { deleteChat, getChat, saveChat } from "@/lib/db/chats.server";
import { dbError, getDb, toDbErrorResponse } from "@/lib/db/mongo.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET → the full ChatSession (transcript, feedback, mission, summary). */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isChatId(id)) return dbError("not_found", 404);
  try {
    const db = await getDb();
    if (!db) return dbError("db_not_configured", 503);
    const chat = await getChat(db, id);
    return chat ? Response.json(chat, { headers: { "Cache-Control": "no-store" } }) : dbError("not_found", 404);
  } catch (err) {
    return toDbErrorResponse(err);
  }
}

/** PUT ChatSessionInput → the saved ChatSession. Creates the session on first save. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const input = readChatSessionInput(await req.json().catch(() => null));
  if (!isChatId(id) || !input) return dbError("bad_request", 400);
  try {
    const db = await getDb();
    if (!db) return dbError("db_not_configured", 503);
    const chat = await saveChat(db, id, input);
    return Response.json({ id: chat.id, updatedAt: chat.updatedAt });
  } catch (err) {
    return toDbErrorResponse(err);
  }
}

/** DELETE → { ok: true }. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isChatId(id)) return dbError("not_found", 404);
  try {
    const db = await getDb();
    if (!db) return dbError("db_not_configured", 503);
    return (await deleteChat(db, id)) ? Response.json({ ok: true }) : dbError("not_found", 404);
  } catch (err) {
    return toDbErrorResponse(err);
  }
}
