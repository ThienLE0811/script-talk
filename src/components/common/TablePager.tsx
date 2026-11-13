"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { pageItems } from "@/lib/search";

/**
 * Client-side paging of `items`. Put `scrollRef` on the element around the table: changing page
 * scrolls it back to its top (an inner scroll box), or scrolls the page up to it when it is above the
 * viewport. Call `goToPage(0)` when the search or filter changes.
 */
export function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount - 1); // the list can shrink (delete, search)
  const first = current * pageSize;
  return {
    current,
    pageCount,
    first,
    rows: items.slice(first, first + pageSize),
    scrollRef,
    goToPage: (n: number) => {
      setPage(n);
      const el = scrollRef.current;
      if (!el) return;
      if (el.scrollHeight > el.clientHeight) el.scrollTo({ top: 0 });
      else if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
    },
  };
}

/** Footer under a table: a summary on the left, page buttons on the right (when there is more than one page). */
export function TablePager({
  current,
  pageCount,
  onPageChange,
  children,
}: {
  current: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Summary text, e.g. "11–20 / 37 câu". */
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
      <span className="tabular-nums">{children}</span>
      {pageCount > 1 && (
        <nav className="flex items-center gap-0.5" aria-label="Phân trang">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPageChange(current - 1)}
            disabled={current === 0}
            aria-label="Trang trước"
          >
            <ChevronLeftIcon />
          </Button>
          {pageItems(current, pageCount).map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="px-1">
                …
              </span>
            ) : (
              <Button
                key={n}
                variant={n === current ? "secondary" : "ghost"}
                size="icon-sm"
                className="tabular-nums"
                onClick={() => onPageChange(n)}
                aria-label={`Trang ${n + 1}`}
                aria-current={n === current ? "page" : undefined}
              >
                {n + 1}
              </Button>
            ),
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPageChange(current + 1)}
            disabled={current === pageCount - 1}
            aria-label="Trang sau"
          >
            <ChevronRightIcon />
          </Button>
        </nav>
      )}
    </div>
  );
}
