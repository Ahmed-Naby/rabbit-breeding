"use client";

import * as React from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { SortIcon } from "@/components/sort-icon";
import { TablePager, LOG_PAGE_SIZE, pageCountOf } from "@/components/ui/table-pager";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";
import { compareRows, type SortDirection, type SortPrimitive, type SortType } from "@/lib/sortable";

export interface SortableColumn {
  key: string;
  label: React.ReactNode;
  type?: SortType;
  className?: string;
  /** Set false for columns with no meaningful sort order (index, actions). */
  sortable?: boolean;
}

export interface SortableRowItem {
  key: string;
  sortValues: Record<string, SortPrimitive>;
  node: React.ReactNode;
}

/**
 * One cell of an optional banner row rendered above the column headers, for
 * labelling a run of related columns (e.g. «الرعاية» over أحياء + نافق).
 * Spans are positional and must cover every column, so a group with no label
 * is how you leave the columns before/after a banner blank.
 */
export interface SortableColumnGroup {
  label?: React.ReactNode;
  /** How many columns this cell spans. */
  span: number;
  className?: string;
}

/**
 * A sortable variant of the shared `Table` primitives. Server Components
 * fetch and shape `rows` as usual (each row pre-rendered into `node`, since
 * a Server Component can pass rendered children across the client boundary
 * but not render functions); this component only owns the sort state and
 * reorders the already-rendered row nodes by `sortValues`.
 */
export function SortableTable({
  columns,
  columnGroups,
  rows,
  headerRowClassName,
  initialSortKey,
  initialSortDirection = "asc",
  paginate,
  pageSize = LOG_PAGE_SIZE,
  locale = "ar",
}: {
  columns: SortableColumn[];
  /** Optional banner row above the headers; spans must add up to columns.length. */
  columnGroups?: SortableColumnGroup[];
  rows: SortableRowItem[];
  headerRowClassName?: string;
  /** Seeds the default sort (e.g. natural tag order) instead of raw row order. */
  initialSortKey?: string;
  initialSortDirection?: SortDirection;
  /**
   * Opt-in, not the default: an archive log is read a page at a time, but the
   * working tables (الأمهات, الجولات اليومية…) are worked through top to bottom
   * and a pager there would hide half the herd behind a button.
   */
  paginate?: boolean;
  pageSize?: number;
  /** Only reaches the pager's own labels — the rows are rendered by the caller. */
  locale?: Locale;
}) {
  const [sort, setSort] = React.useState<{ key: string | null; direction: SortDirection }>({
    key: initialSortKey ?? null,
    direction: initialSortDirection,
  });
  const { key: sortKey, direction } = sort;
  const [page, setPage] = React.useState(0);
  // Back to page 1 whenever the rows themselves change — a date filter that
  // cuts 700 rows down to 12 would otherwise leave the table on page 8 of 1,
  // i.e. blank. Adjusting state during render rather than in an effect: this
  // is the same render, so the stale page is never painted.
  const [renderedRows, setRenderedRows] = React.useState(rows);
  if (renderedRows !== rows) {
    setRenderedRows(rows);
    setPage(0);
  }

  const sorted = React.useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const type = col.type ?? "string";
    return [...rows].sort((a, b) => compareRows(a.sortValues[sortKey], b.sortValues[sortKey], type, direction));
  }, [rows, columns, sortKey, direction]);

  // Clamped rather than trusted: `rows` can shrink without changing identity
  // (a parent re-render with a filtered copy is a new array, but a page left
  // over from a longer list is still worth guarding).
  const pageCount = pageCountOf(sorted.length, pageSize);
  const safePage = Math.min(page, pageCount - 1);
  const visible = paginate ? sorted.slice(safePage * pageSize, (safePage + 1) * pageSize) : sorted;

  function toggleSort(key: string) {
    // A new sort order makes the old page number meaningless — page 4 of the
    // date sort has nothing to do with page 4 of the tag sort.
    setPage(0);
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }

  const table = (
    <Table>
      <TableHeader>
        {columnGroups && (
          // Index keys: the groups are a fixed positional layout declared
          // alongside `columns`, never reordered by the sort below.
          <TableRow className={headerRowClassName}>
            {columnGroups.map((g, i) =>
              g.label == null ? (
                // An unlabelled group is filler, so it draws one empty cell per
                // column instead of a single spanning one — that keeps every
                // vertical rule of the header row running to the top of the
                // table rather than stopping under the banner.
                Array.from({ length: g.span }, (_, j) => <TableHead key={`${i}-${j}`} />)
              ) : (
                <TableHead key={i} colSpan={g.span} className={cn("text-center", g.className)}>
                  {g.label}
                </TableHead>
              )
            )}
          </TableRow>
        )}
        <TableRow className={headerRowClassName}>
          {columns.map((col) =>
            col.sortable === false ? (
              <TableHead key={col.key} className={col.className}>
                {col.label}
              </TableHead>
            ) : (
              <TableHead
                key={col.key}
                className={cn(col.className, "cursor-pointer select-none")}
                onClick={() => toggleSort(col.key)}
              >
                <span className="inline-flex items-center justify-center gap-1">
                  {col.label}
                  <SortIcon active={sortKey === col.key} direction={direction} />
                </span>
              </TableHead>
            )
          )}
        </TableRow>
      </TableHeader>
      <TableBody>{visible.map((r) => r.node)}</TableBody>
    </Table>
  );

  if (!paginate) return table;

  return (
    <>
      {table}
      <TablePager
        page={safePage}
        total={sorted.length}
        pageSize={pageSize}
        onPageChange={setPage}
        locale={locale}
      />
    </>
  );
}
