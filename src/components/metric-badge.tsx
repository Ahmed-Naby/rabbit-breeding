import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small label+value pill for a single derived stat (fertility rate, avg litter size, etc). */
export function MetricBadge({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1.5 text-xs",
        className
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}
