"use client";

import * as React from "react";
import { SortIcon } from "@/components/sort-icon";
import { cn } from "@/lib/utils";

/**
 * A `<th>` for plain hand-rolled HTML tables (used across the mobile app's
 * pages, which don't use the shadcn `Table` primitives). Pairs with
 * `useSortableRows` — pass that hook's `sortKey`/`direction`/`toggleSort`.
 */
export function SortableTh({
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
  className,
  sortable = true,
}: {
  label: React.ReactNode;
  sortKey: string;
  activeSortKey: string | null;
  direction: "asc" | "desc";
  onSort: (key: string) => void;
  className?: string;
  sortable?: boolean;
}) {
  if (!sortable) {
    return <th className={className}>{label}</th>;
  }
  return (
    <th className={cn(className, "cursor-pointer select-none")} onClick={() => onSort(sortKey)}>
      <span className="inline-flex items-center justify-center gap-1">
        {label}
        <SortIcon active={activeSortKey === sortKey} direction={direction} />
      </span>
    </th>
  );
}
