import { cn } from "@/lib/utils";

/**
 * Row count shown next to a log's heading (سجل التلقيح ⑬).
 *
 * Always pass the length of the rows actually being rendered, never a separate
 * "total" query — on /records the tables are date-filtered, and the whole point
 * of the badge is to say how many fall inside the chosen range.
 *
 * Hidden at zero: the empty state underneath already says there's nothing.
 * `showZero` overrides that for logs whose panels are read side by side — in
 * سجل النافق the five figures are compared against each other, and a heading
 * that simply drops its number reads as "not counted yet" rather than "none".
 *
 * `unit` names what is being counted, after the number («1,629 عملية فطام»).
 * Worth passing wherever the heading sits next to a total of a different kind —
 * on سجل الفطام a bare 1,629 beside «إجمالي المفطومين 9,556» invites reading
 * both as head counts, when the first one counts weanings.
 */
export function LogCountBadge({
  count,
  showZero,
  unit,
}: {
  count: number;
  showZero?: boolean;
  unit?: string;
}) {
  if (count === 0 && !showZero) return null;
  return (
    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-bold tabular-nums text-primary">
      {count.toLocaleString()}
      {unit ? <span className="font-medium"> {unit}</span> : null}
    </span>
  );
}

/**
 * Labelled companion to LogCountBadge, for figures the row count alone can't
 * carry (إجمالي النتاج، متوسط البطن). Same rule: derive it from the rendered
 * rows so it tracks the date filter.
 */
export function LogStatBadge({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  /**
   * "muted" is the default because these usually sit *beside* a LogCountBadge
   * (سجل الفطام carries three at once) and a row of equally loud badges has no
   * focus left. Pass "primary" only where the figure stands alone and is the
   * point of the heading — المخزون المتاح on الفطام والبيع.
   */
  tone?: "muted" | "primary";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "primary"
          ? "bg-primary/10 text-primary"
          : "border border-border/70 bg-muted/40 text-muted-foreground"
      )}
    >
      {label}{" "}
      <span className={cn("font-bold tabular-nums", tone === "primary" ? "" : "text-foreground")}>
        {value}
      </span>
    </span>
  );
}
