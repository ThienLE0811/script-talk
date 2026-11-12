import type { Metadata } from "next";
import ScriptPractice from "@/components/script/ScriptPractice";

export const metadata: Metadata = {
  title: "Luyện theo kịch bản",
};

export default function ScriptPage() {
  return <ScriptPractice />;
}
