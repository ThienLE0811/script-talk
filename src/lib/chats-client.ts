/** Client-side calls to /api/chats (saved conversations live in MongoDB). */
import { requestJSON } from "./ai-errors";
import type { ChatSession, ChatSessionInput, ChatSessionMeta } from "./chat/history";

export const fetchChats = () => requestJSON<ChatSessionMeta[]>("GET", "/api/chats");

export const fetchChat = (id: string) => requestJSON<ChatSession>("GET", `/api/chats/${encodeURIComponent(id)}`);

export const saveChat = (id: string, input: ChatSessionInput) =>
  requestJSON<{ id: string; updatedAt: number }>("PUT", `/api/chats/${encodeURIComponent(id)}`, input);

/** Last-chance save when the page or the conversation is closed; the request outlives the page. */
export function saveChatOnExit(id: string, input: ChatSessionInput) {
  try {
    void fetch(`/api/chats/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* nothing more we can do */
  }
}

export const deleteChat = (id: string) =>
  requestJSON<{ ok: true }>("DELETE", `/api/chats/${encodeURIComponent(id)}`);
