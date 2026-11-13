import type { Metadata } from "next";
import { Suspense } from "react";
import ScriptPractice from "@/components/script/ScriptPractice";

export const metadata: Metadata = {
  title: "Luyện theo kịch bản",
};

export default function ScriptPage() {
  // ScriptPractice reads the screen from the URL (useSearchParams), which needs a Suspense boundary.
  return (
    <Suspense>
      <ScriptPractice />
    </Suspense>
  );
}
