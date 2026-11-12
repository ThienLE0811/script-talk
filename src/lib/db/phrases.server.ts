// Server-only data access for the phrasebook.
import type { Collection, Db } from "mongodb";
import { newScriptId } from "@/lib/backup";
import { phraseKey, scheduleAfterReview, type NewPhrase, type Phrase } from "@/lib/phrasebook";

/** Stored document. `key` (normalised text) is unique, so the same sentence is never stored twice. */
type PhraseDoc = Omit<Phrase, "id"> & { _id: string; key: string };

let indexesReady: Promise<unknown> | null = null;

async function phrases(db: Db): Promise<Collection<PhraseDoc>> {
  const col = db.collection<PhraseDoc>("phrases");
  indexesReady ??= Promise.all([
    col.createIndex({ key: 1 }, { unique: true }),
    col.createIndex({ dueAt: 1 }),
  ]).catch((err) => {
    indexesReady = null;
    throw err;
  });
  await indexesReady;
  return col;
}

const toPhrase = (doc: PhraseDoc): Phrase => {
  const { _id, key, ...rest } = doc;
  void key; // internal de-duplication key, not part of the API
  return { id: _id, ...rest };
};

export async function listPhrases(db: Db): Promise<Phrase[]> {
  const docs = await (await phrases(db)).find().sort({ dueAt: 1, createdAt: -1 }).toArray();
  return docs.map(toPhrase);
}

/**
 * Add phrases, skipping ones already in the book (same normalised text). A duplicate keeps its
 * review progress; a missing note/original is filled in from the new copy.
 */
export async function addPhrases(db: Db, items: NewPhrase[]): Promise<{ added: number; existing: number }> {
  const col = await phrases(db);
  const now = Date.now();
  let added = 0;
  let existing = 0;
  const seen = new Set<string>();
  for (const item of items) {
    const key = phraseKey(item.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      const res = await col.updateOne(
        { key },
        {
          $setOnInsert: {
            _id: newScriptId(),
            key,
            text: item.text,
            source: item.source,
            ...(item.context ? { context: item.context } : {}),
            createdAt: now,
            box: 0,
            dueAt: now,
            reviews: 0,
          },
        },
        { upsert: true },
      );
      if (res.upsertedCount) added++;
      else existing++;
    } catch (err) {
      // Two requests adding the same sentence at once: the other one won, which is fine.
      if ((err as { code?: number }).code !== 11000) throw err;
      existing++;
    }
    // Optional fields are filled only where missing, so an existing phrase keeps its own.
    if (item.original) await col.updateOne({ key, original: { $exists: false } }, { $set: { original: item.original } });
    if (item.note) await col.updateOne({ key, note: { $exists: false } }, { $set: { note: item.note } });
  }
  return { added, existing };
}

export async function recordReview(db: Db, id: string, score: number, passed: boolean): Promise<Phrase | null> {
  const col = await phrases(db);
  const current = await col.findOne({ _id: id });
  if (!current) return null;
  const now = Date.now();
  const next = scheduleAfterReview(current.box, passed, now);
  const doc = await col.findOneAndUpdate(
    { _id: id },
    { $set: { ...next, lastScore: Math.round(score), lastReviewedAt: now }, $inc: { reviews: 1 } },
    { returnDocument: "after" },
  );
  return doc ? toPhrase(doc) : null;
}

export async function deletePhrase(db: Db, id: string): Promise<boolean> {
  return (await (await phrases(db)).deleteOne({ _id: id })).deletedCount === 1;
}
