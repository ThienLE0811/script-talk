/** Client-side calls to /api/phrases (the phrasebook lives in MongoDB). */
import { requestJSON } from "./ai-errors";
import type { NewPhrase, Phrase } from "./phrasebook";

export const fetchPhrases = () => requestJSON<Phrase[]>("GET", "/api/phrases");

export const addPhrases = (items: NewPhrase[]) =>
  requestJSON<{ added: number; existing: number }>("POST", "/api/phrases", { items });

export const reviewPhrase = (id: string, score: number, passed: boolean) =>
  requestJSON<Phrase>("PATCH", `/api/phrases/${encodeURIComponent(id)}`, { score, passed });

export const deletePhrase = (id: string) =>
  requestJSON<{ ok: true }>("DELETE", `/api/phrases/${encodeURIComponent(id)}`);
