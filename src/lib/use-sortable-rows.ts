"use client";

import { useCallback, useMemo, useState } from "react";
import { compareRows, type SortDirection, type SortPrimitive, type SortType } from "@/lib/sortable";

export interface SortColumnDef<T> {
  type?: SortType;
  value: (row: T) => SortPrimitive;
}

/**
 * Client-side sort state + derived sorted array for a table whose rows are
 * already available in full (no server-side pagination). `columns` maps a
 * sort key (matching the key passed to `toggleSort`) to how to read/compare
 * that column's value.
 */
export function useSortableRows<T>(rows: T[], columns: Record<string, SortColumnDef<T>>) {
  const [sort, setSort] = useState<{ key: string | null; direction: SortDirection }>({
    key: null,
    direction: "asc",
  });
  const { key: sortKey, direction } = sort;

  const sorted = useMemo(() => {
    if (!sortKey || !columns[sortKey]) return rows;
    const { value, type = "string" } = columns[sortKey];
    return [...rows].sort((a, b) => compareRows(value(a), value(b), type, direction));
  }, [rows, columns, sortKey, direction]);

  const toggleSort = useCallback((key: string) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }, []);

  return { sorted, sortKey, direction, toggleSort };
}
