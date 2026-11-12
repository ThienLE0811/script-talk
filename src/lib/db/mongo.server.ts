// Server-only: reads MONGODB_URI. Never import this from a client component.
import { MongoClient, type Db } from "mongodb";

/**
 * One MongoClient per process, kept on globalThis so dev hot-reloads and warm serverless
 * invocations reuse the same connection pool instead of opening new ones.
 */
const globalForMongo = globalThis as unknown as { _scripttalkMongo?: Promise<MongoClient> };

export function isDbConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

/** The app database, or null when MONGODB_URI is not set. */
export async function getDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  globalForMongo._scripttalkMongo ??= new MongoClient(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
    appName: "scripttalk",
  })
    .connect()
    .catch((err) => {
      globalForMongo._scripttalkMongo = undefined; // let the next request retry
      throw err;
    });
  const client = await globalForMongo._scripttalkMongo;
  return client.db(process.env.MONGODB_DB || "scripttalk");
}

export type DbErrorCode = "db_not_configured" | "db_error" | "not_found" | "bad_request";

export function dbError(code: DbErrorCode, status: number): Response {
  return Response.json({ error: code }, { status });
}

export function toDbErrorResponse(err: unknown): Response {
  console.error("[db] request failed:", err);
  return dbError("db_error", 503);
}
