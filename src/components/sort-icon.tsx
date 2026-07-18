"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

export function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />;
  return direction === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5" />
  );
}
