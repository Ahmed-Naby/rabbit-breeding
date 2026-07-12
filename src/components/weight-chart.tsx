"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { WeightUnit } from "@/lib/enums";
import { gramsToKg, gramsToLbOz } from "@/lib/units";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import type { Locale } from "@/lib/i18n/locales";

export type WeightPoint = { dateMs: number; grams: number };

function toDisplay(grams: number, unit: WeightUnit): number {
  if (unit === "kg") return Math.round(gramsToKg(grams) * 1000) / 1000;
  const { lb, oz } = gramsToLbOz(grams);
  return Math.round((lb + oz / 16) * 100) / 100;
}

export function WeightChart({
  points,
  unit,
  t,
  locale,
}: {
  points: WeightPoint[];
  unit: WeightUnit;
  t: Dictionary["common"];
  locale: Locale;
}) {
  const unitLabel = unit === "kg" ? t.weightUnitKg : t.weightUnitLb;
  const data = points
    .slice()
    .sort((a, b) => a.dateMs - b.dateMs)
    .map((p) => ({
      date: new Date(p.dateMs).toLocaleDateString(locale, {
        month: "short",
        day: "numeric",
      }),
      weight: toDisplay(p.grams, unit),
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        {t.noWeightRecords}
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
            unit={unitLabel}
          />
          <Tooltip
            formatter={(v) => [`${v} ${unitLabel}`, t.weightChartLabel]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--popover)",
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="weight"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
