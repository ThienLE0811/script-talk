"use client";

import { ArrowRightIcon, NotebookPenIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { phraseStats } from "@/lib/phrasebook";
import { fetchPhrases } from "@/lib/phrases-client";

/** Home-page reminder of phrases due today. Renders nothing when none are due or the DB is unavailable. */
export default function DueReviewBanner() {
  const [due, setDue] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchPhrases()
      .then((list) => {
        if (alive) setDue(phraseStats(list).due);
      })
      .catch(() => {
        /* no banner without data */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!due) return null;
  return (
    <Link
      href="/phrases"
      className="mb-6 flex items-center gap-3 rounded-xl border border-primary/30 bg-accent px-4 py-3 text-accent-foreground transition outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <NotebookPenIcon className="size-5 shrink-0" />
      <span className="flex-1 text-sm">
        Hôm nay có <span className="font-semibold">{due} câu</span> trong sổ tay cần ôn.
      </span>
      <span className="flex items-center gap-1 text-sm font-medium">
        Ôn ngay <ArrowRightIcon className="size-4" />
      </span>
    </Link>
  );
}
