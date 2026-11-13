/** Text search helpers shared by the lists. Pure logic: no DOM. */

/** Lowercase and strip Vietnamese diacritics so "khach san" finds "Khách sạn". */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

/** Page buttons to show (0-based), with "…" for gaps: first, last, and the pages around the current one. */
export function pageItems(current: number, count: number): (number | "…")[] {
  const pages = [...new Set([0, current - 1, current, current + 1, count - 1])]
    .filter((n) => n >= 0 && n < count)
    .sort((a, b) => a - b);
  return pages.flatMap((n, i) => (i > 0 && n - pages[i - 1] > 1 ? ["…" as const, n] : [n]));
}
