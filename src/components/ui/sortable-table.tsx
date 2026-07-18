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
 * A sortable variant of the shared `Table` primitives. Server Components
 * fetch and shape `rows` as usual (each row pre-rendered into `node`, since
 * a Server Component can pass rendered children across the client boundary
 * but not render functions); this component only owns the sort state and
 * reorders the already-rendered row nodes by `sortValues`.
 */
export function SortableTable({
  columns,
  rows,
  headerRowClassName,
}: {
  columns: SortableColumn[];
  rows: SortableRowItem[];
  headerRowClassName?: string;
}) {
  const [sort, setSort] = React.useState<{ key: string | null; direction: SortDirection }>({
    key: null,
    direction: "asc",
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
