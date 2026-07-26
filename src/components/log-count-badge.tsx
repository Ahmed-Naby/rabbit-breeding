/**
 * Row count shown next to a log's heading (سجل التلقيح ⑬).
 *
 * Always pass the length of the rows actually being rendered, never a separate
 * "total" query — on /records the tables are date-filtered, and the whole point
 * of the badge is to say how many fall inside the chosen range.
 *
 * Hidden at zero: the empty state underneath already says there's nothing.
 */
export function LogCountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-bold tabular-nums text-primary">
      {count.toLocaleString()}
    </span>
  );
}

/**
 * Labelled companion to LogCountBadge, for figures the row count alone can't
 * carry (إجمالي النتاج، متوسط البطن). Same rule: derive it from the rendered
 * rows so it tracks the date filter.
 */
export function LogStatBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {label} <span className="font-bold tabular-nums text-foreground">{value}</span>
    </span>
  );
}
