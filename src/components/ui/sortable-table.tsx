"use client";

import * as React from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { SortIcon } from "@/components/sort-icon";
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
}: {
  columns: SortableColumn[];
  /** Optional banner row above the headers; spans must add up to columns.length. */
  columnGroups?: SortableColumnGroup[];
  rows: SortableRowItem[];
  headerRowClassName?: string;
  /** Seeds the default sort (e.g. natural tag order) instead of raw row order. */
  initialSortKey?: string;
  initialSortDirection?: SortDirection;
}) {
  const [sort, setSort] = React.useState<{ key: string | null; direction: SortDirection }>({
    key: initialSortKey ?? null,
    direction: initialSortDirection,
  });
  const { key: sortKey, direction } = sort;

  const sorted = React.useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const type = col.type ?? "string";
    return [...rows].sort((a, b) => compareRows(a.sortValues[sortKey], b.sortValues[sortKey], type, direction));
  }, [rows, columns, sortKey, direction]);

  function toggleSort(key: string) {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }

  return (
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
      <TableBody>{sorted.map((r) => r.node)}</TableBody>
    </Table>
  );
}
