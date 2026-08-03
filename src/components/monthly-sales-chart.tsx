"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { MonthlySalesPoint } from "@/lib/kit-stock-series";
import type { Locale } from "@/lib/i18n/locales";

/**
 * «البيع الشهري» — one bar per calendar month since the farm's first sale,
 * with the does that stood on the 1st of that month beside it in blue.
 *
 * Bars, not a line: months are discrete buckets that are summed, and a line
 * between them would suggest a rate sliding from one month into the next.
 *
 * TWO axes, deliberately. Sales run in the hundreds and does in the dozens, so
 * on one scale the herd bar would be a blue smudge along the floor. The cost is
 * that bar HEIGHTS across the two series mean nothing to each other — hence a
 * tick colour per axis matching its series, and the note under the card.
 *
 * Both bundles render this same component; each builds its points with
 * buildMonthlySalesSeries.
 */
export function MonthlySalesChart({
  points,
  locale,
  label,
  doesLabel,
  emptyText,
}: {
  points: MonthlySalesPoint[];
  locale: Locale;
  /** Tooltip and legend name for the sales bars, e.g. «عدد البيع». */
  label: string;
  /** Same, for the herd bars, e.g. «الأمهات النشطة». */
  doesLabel: string;
  emptyText: string;
}) {
  // The year only earns axis space once the farm crosses into a second one —
  // «يناير» twice on one axis is worse than no label at all.
  const spansYears =
    points.length > 0 &&
    new Date(points[0].monthMs).getFullYear() !==
      new Date(points[points.length - 1].monthMs).getFullYear();

  const data = points.map((p) => ({
    month: new Date(p.monthMs).toLocaleDateString(locale, {
      month: "short",
      ...(spansYears ? { year: "2-digit" } : {}),
    }),
    [label]: p.count,
    [doesLabel]: p.does,
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="h-72 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={16}
          />
          <YAxis
            yAxisId="sales"
            tick={{ fontSize: 11, fill: "var(--chart-2)" }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <YAxis
            yAxisId="does"
            orientation="right"
            tick={{ fontSize: 11, fill: "var(--chart-6)" }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            formatter={(v, name) => [Number(v).toLocaleString(), name]}
            // The default hover fill is a grey block that swallows the bars.
            cursor={{ fill: "var(--muted)", opacity: 0.35 }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--popover)",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          <Bar
            yAxisId="sales"
            dataKey={label}
            fill="var(--chart-2)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            yAxisId="does"
            dataKey={doesLabel}
            fill="var(--chart-6)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
