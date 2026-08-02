"use client";

import { useCallback, useMemo, useState } from "react";
import { compareRows, type SortDirection, type SortPrimitive, type SortType } from "@/lib/sortable";
import { LOG_PAGE_SIZE, pageCountOf } from "@/components/ui/table-pager";

export interface SortColumnDef<T> {
  type?: SortType;
  value: (row: T) => SortPrimitive;
}

/**
 * Client-side sort state + derived sorted array for a table whose rows are
 * already available in full (no server-side pagination). `columns` maps a
 * sort key (matching the key passed to `toggleSort`) to how to read/compare
 * that column's value.
 *
 * `initial` seeds the default sort (e.g. natural tag order) so the table isn't
 * shown in raw query order until the user clicks a header; omit it to start
 * unsorted. It only sets the starting state — the header toggles still win.
 *
 * `paged` is `sorted` cut to one page; a caller that renders `sorted` instead
 * simply never shows a pager, which is how the working tables (الأمهات,
 * الجولات اليومية) stay in one uninterrupted list.
 */
export function useSortableRows<T>(
  rows: T[],
  columns: Record<string, SortColumnDef<T>>,
  initial?: { key: string; direction?: SortDirection },
  pageSize = LOG_PAGE_SIZE
) {
  const [sort, setSort] = useState<{ key: string | null; direction: SortDirection }>({
    key: initial?.key ?? null,
    direction: initial?.direction ?? "asc",
  });
  const { key: sortKey, direction } = sort;
  const [page, setPage] = useState(0);
  // Back to page 1 whenever the rows themselves change — a reload that cuts
  // 700 rows down to 12 would otherwise leave the table on page 8 of 1, i.e.
  // blank. Adjusted during render rather than in an effect: it is the same
  // render, so the stale page is never painted.
  const [renderedRows, setRenderedRows] = useState(rows);
  if (renderedRows !== rows) {
    setRenderedRows(rows);
    setPage(0);
  }

  const sorted = useMemo(() => {
    if (!sortKey || !columns[sortKey]) return rows;
    const { value, type = "string" } = columns[sortKey];
    return [...rows].sort((a, b) => compareRows(value(a), value(b), type, direction));
  }, [rows, columns, sortKey, direction]);

  const toggleSort = useCallback((key: string) => {
    // A new sort order makes the old page number meaningless — page 4 of the
    // date sort has nothing to do with page 4 of the tag sort.
    setPage(0);
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }, []);

  const safePage = Math.min(page, pageCountOf(sorted.length, pageSize) - 1);
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  return { sorted, paged, page: safePage, setPage, pageSize, sortKey, direction, toggleSort };
}
