// Server-only data access for saved conversations (collection `chats`).
import type { Collection, Db } from "mongodb";
import {
  sessionStats,
  type ChatSession,
  type ChatSessionInput,
  type ChatSessionMeta,
} from "@/lib/chat/history";

type ChatDoc = Omit<ChatSession, "id"> & { _id: string };

/** Enough for months of daily practice; the list and the progress page read only metadata. */
const LIST_LIMIT = 500;
const MAX_ACTIVITY = 100;

let indexesReady: Promise<unknown> | null = null;

async function chats(db: Db): Promise<Collection<ChatDoc>> {
  const col = db.collection<ChatDoc>("chats");
  indexesReady ??= col.createIndex({ updatedAt: -1 }).catch((err) => {
    indexesReady = null;
    throw err;
  });
  await indexesReady;
  return col;
}

const toSession = ({ _id, ...rest }: ChatDoc): ChatSession => ({ id: _id, ...rest, activity: rest.activity ?? [] });

/** Most recent first, without transcripts. */
export async function listChats(db: Db): Promise<ChatSessionMeta[]> {
  const docs = await (await chats(db))
    .find({}, { projection: { turns: 0, mission: 0, "summary.strengths": 0, "summary.phrases": 0 } })
    .sort({ updatedAt: -1 })
    .limit(LIST_LIMIT)
    .toArray();
  return docs.map(({ _id, summary, ...rest }) => ({
    id: _id,
    topicId: rest.topicId,
    ...(rest.customTopic ? { customTopic: rest.customTopic } : {}),
    level: rest.level,
    topicLabel: rest.topicLabel,
    stats: rest.stats,
    activity: rest.activity ?? [],
    createdAt: rest.createdAt,
    updatedAt: rest.updatedAt,
    focus: (summary?.focus ?? []).map((f) => f.issue).filter(Boolean),
  }));
}

export async function getChat(db: Db, id: string): Promise<ChatSession | null> {
  const doc = await (await chats(db)).findOne({ _id: id });
  return doc ? toSession(doc) : null;
}

/** Create or replace a conversation (the client saves the whole session each time). */
export async function saveChat(db: Db, id: string, input: ChatSessionInput): Promise<ChatSession> {
  const now = Date.now();
  const col = await chats(db);
  const stats = sessionStats(input.turns, input.mission);
  // Only new learner turns count as practice: reopening an old session to read it does not.
  const prev = await col.findOne({ _id: id }, { projection: { "stats.userTurns": 1 } });
  const practiced = !prev || stats.userTurns > (prev.stats?.userTurns ?? 0);
  // Fields the new version no longer has (e.g. a summary made before "Trò chuyện tiếp").
  const unset = (["summary", "mission", "customTopic"] as const).filter((k) => !input[k]);
  const doc = await col.findOneAndUpdate(
    { _id: id },
    {
      $set: { ...input, stats, updatedAt: now },
      $setOnInsert: { createdAt: now },
      ...(practiced ? { $push: { activity: { $each: [now], $slice: -MAX_ACTIVITY } } } : {}),
      ...(unset.length ? { $unset: Object.fromEntries(unset.map((k) => [k, ""])) } : {}),
    },
    { upsert: true, returnDocument: "after" },
  );
  return toSession(doc!);
}

export async function deleteChat(db: Db, id: string): Promise<boolean> {
  return (await (await chats(db)).deleteOne({ _id: id })).deletedCount === 1;
}
