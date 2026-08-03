"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { KitStockBucket, KitStockPoint } from "@/lib/kit-stock-series";
import type { Locale } from "@/lib/i18n/locales";

/**
 * «رصيد الفطام المتاح للبيع» over the farm's whole life. Both bundles render
 * this same component; each builds its points with buildKitStockSeries.
 */
export function KitStockChart({
  points,
  bucket,
  locale,
  label,
  emptyText,
}: {
  points: KitStockPoint[];
  bucket: KitStockBucket;
  locale: Locale;
  /** Tooltip series name, e.g. «رصيد الفطام». */
  label: string;
  emptyText: string;
}) {
  // A day bucket wants a day number; a month bucket wants the month and, once
  // the farm crosses a new year, the year too — «يناير» twice on one axis is
  // worse than no label at all.
  const spansYears =
    points.length > 0 &&
    new Date(points[0].dateMs).getFullYear() !== new Date(points[points.length - 1].dateMs).getFullYear();
  const format = (ms: number) =>
    new Date(ms).toLocaleDateString(locale, {
      month: "short",
      ...(bucket === "month" ? {} : { day: "numeric" }),
      ...(spansYears ? { year: "2-digit" } : {}),
    });

  const data = points.map((p) => ({ date: format(p.dateMs), balance: p.balance }));

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
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="kitStockFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            formatter={(v) => [Number(v).toLocaleString(), label]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--popover)",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#kitStockFill)"
            // No dots: a lifetime series can carry 60 points, and a dot on each
            // turns the line into a dashed smear.
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
