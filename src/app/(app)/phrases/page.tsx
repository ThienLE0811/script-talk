import type { Metadata } from "next";
import Phrasebook from "@/components/phrases/Phrasebook";

export const metadata: Metadata = {
  title: "Sổ tay câu",
};

export default function PhrasesPage() {
  return <Phrasebook />;
}
