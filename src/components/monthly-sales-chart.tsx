"use client";

import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { MonthlySalesPoint } from "@/lib/kit-stock-series";
import type { Locale } from "@/lib/i18n/locales";

/**
 * «البيع الشهري» — one point per calendar month since the farm's first sale,
 * with the does that stood on the 1st of that month behind it in blue and the
 * رصيد الفطام those months closed on over the top.
 *
 * Sales are a LINE, by request. Each month is still its own bucket and the line
 * between two of them is drawn, not measured — but over a couple of years of
 * bars the trend was the thing being read and the bars were what made it hard
 * to see. The dot on every month is what keeps the reading honest: it marks
 * where a real figure sits, and the segments only join them.
 *
 * The herd stays a bar. It is the denominator the other two are read against
 * rather than a third trend, and a filled shape behind two lines separates the
 * background from the movement without needing a third colour to be learned.
 *
 * ONE shared axis, by request. It was briefly split — sales run in the hundreds
 * and does in the dozens, so the herd bar is short here — but two scales made
 * the heights mean nothing to each other, and being able to see the small
 * number against the big one is the point of putting them together.
 *
 * Over each herd bar sits that month's own sold ÷ does, which is the one thing
 * the two are there to be compared for and the hardest to read off the chart by
 * eye. It rides the bar rather than the sales line so the figures sit in a
 * near-level row instead of climbing with the selling.
 *
 * The رصيد الفطام curve rides on the same axis for the same reason: it used to
 * be a second card below with its own scale, where the eye could not tell
 * whether a dip in the balance was the month's selling or its weaning.
 *
 * Both bundles render this same component; each builds its points with
 * buildMonthlySalesSeries.
 */
export function MonthlySalesChart({
  points,
  locale,
  label,
  doesLabel,
  balanceLabel,
  emptyText,
}: {
  points: MonthlySalesPoint[];
  locale: Locale;
  /** Tooltip and legend name for the sales bars, e.g. «عدد البيع». */
  label: string;
  /** Same, for the herd bars, e.g. «الأمهات النشطة». */
  doesLabel: string;
  /** Same, for the balance line, e.g. «رصيد الفطام». */
  balanceLabel: string;
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
    [balanceLabel]: p.balance,
    // The month's own «معدل البيع لكل أم», printed over its bars so the reader
    // does not have to divide two bar heights by eye. A month with no does on
    // file has no ratio at all — printing 0 there would read as "sold nothing".
    ratio: p.does > 0 ? p.count / p.does : null,
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
        {/* Extra headroom on top: the ratio label sits above the tallest bar. */}
        <ComposedChart data={data} margin={{ top: 20, right: 4, left: -12, bottom: 0 }}>
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
          {/* The herd first, so the two lines are drawn over it and not under.
              Same axis as the sales line, so a month's herd is read against the
              head it shipped rather than against its own private scale. */}
          <Bar dataKey={doesLabel} fill="var(--chart-6)" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {/* The month's own sold ÷ does, printed over the DOES bar — the
                divisor it is measured per. It sat over the sales line until a
                farmer asked for it here, where the bar tops are level with each
                other and the row of figures reads as a row instead of riding up
                and down with the selling. */}
            <LabelList
              dataKey="ratio"
              position="top"
              offset={6}
              fontSize={10}
              className="fill-muted-foreground"
              formatter={(v: unknown) => (typeof v === "number" ? v.toFixed(1) : "")}
            />
          </Bar>
          {/* linear, not monotone: a monotone curve overshoots between two
              months and would draw a peak in a month that never sold one. */}
          <Line
            type="linear"
            dataKey={label}
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0, fill: "var(--chart-2)" }}
            activeDot={{ r: 4 }}
          />
          {/* No dots on this one: it is a level to be read as a shape, and the
              month's own figures are already marked on the sales line. */}
          <Line
            type="linear"
            dataKey={balanceLabel}
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
