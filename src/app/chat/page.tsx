import type { Metadata } from "next";
import ChatPractice from "@/components/chat/ChatPractice";
import { isGeminiConfigured } from "@/lib/chat/gemini.server";

export const metadata: Metadata = {
  title: "Trò chuyện tự nhiên",
};

// Read GEMINI_API_KEY at request time, not at build time.
export const dynamic = "force-dynamic";

export default function ChatPage() {
  return <ChatPractice configured={isGeminiConfigured()} />;
}
