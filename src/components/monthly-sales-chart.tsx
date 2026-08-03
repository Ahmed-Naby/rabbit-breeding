"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { MonthlySalesPoint } from "@/lib/kit-stock-series";
import type { Locale } from "@/lib/i18n/locales";

/**
 * «البيع الشهري» — one bar per calendar month since the farm's first sale.
 * Bars, not a line: months are discrete buckets that are summed, and a line
 * between them would suggest a rate sliding from one month into the next.
 *
 * Both bundles render this same component; each builds its points with
 * buildMonthlySalesSeries.
 */
export function MonthlySalesChart({
  points,
  locale,
  label,
  emptyText,
}: {
  points: MonthlySalesPoint[];
  locale: Locale;
  /** Tooltip series name, e.g. «عدد البيع». */
  label: string;
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
    count: p.count,
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={16}
          />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            formatter={(v) => [Number(v).toLocaleString(), label]}
            // The default hover fill is a grey block that swallows the bar.
            cursor={{ fill: "var(--muted)", opacity: 0.35 }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--popover)",
              fontSize: 12,
            }}
          />
          <Bar dataKey="count" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
