import Link from "next/link";
import { Milk } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { LogCountBadge, LogStatBadge } from "@/components/log-count-badge";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import { weaningSurvivalRate } from "@/lib/kit-mortality";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

export type WeaningLogRow = {
  id: string;
  kindlingDate: Date | null;
  weaningDate: Date;
  bornAlive: number;
  bornDead: number;
  /** Frozen at birth; the gap from bornDead is «نافق الرعاية». -1 = unknown. */
  bornDeadAtKindling: number;
  weaned: number | null;
  weaningWeightGrams: number | null;
  doe: { id: string; tagId: string | null; breed: string | null };
  buck: { tagId: string | null } | null;
};

/**
 * "سجل الفطام": a permanent, read-only archive of every weaning, most recent
 * first. عدد الفطام/وزن الفطام are entered on the الأمهات (does) board and
 * mirrored here one-way — this log never edits or deletes a row.
 */
export function WeaningLog({
  weaningLog,
  locale,
  t,
  todayOnly,
}: {
  weaningLog: WeaningLogRow[];
  locale: Locale;
  t: Dictionary["weaning"];
  todayOnly?: boolean;
}) {
  // weaned is null on rows where the count was never entered (they show «—» in
  // the table); those contribute nothing rather than counting as zero.
  const totalWeaned = weaningLog.reduce((sum, l) => sum + (l.weaned ?? 0), 0);
  // Divided by the rows that actually carry a count, not by every row — the
  // «—» rows would otherwise drag the average down as if they weaned zero.
  const countedRows = weaningLog.filter((l) => l.weaned != null).length;
  const avgWeaned = countedRows === 0 ? 0 : totalWeaned / countedRows;

  return (
    <div className="space-y-3">
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
        {t.logHeading}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
        <LogCountBadge count={weaningLog.length} />
        {weaningLog.length > 0 && (
          <>
            <LogStatBadge label={t.totalWeanedBadge} value={totalWeaned.toLocaleString()} />
            {countedRows > 0 && <LogStatBadge label={t.avgWeanedBadge} value={avgWeaned.toFixed(1)} />}
          </>
        )}
      </h2>
      {weaningLog.length === 0 ? (
        <EmptyState icon={Milk} title={t.logEmptyTitle} description={t.logEmptyDescription} />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            columns={[
              { key: "index", label: t.colIndex, className: "text-center", sortable: false },
              { key: "doeTag", label: t.colMotherTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.colBreed, type: "string", className: "hidden text-center sm:table-cell" },
              { key: "buckTag", label: t.colBuckTag, type: "tag", className: "hidden text-center sm:table-cell" },
              { key: "kindlingDate", label: t.colKindlingDate, type: "date", className: "hidden text-center sm:table-cell" },
              { key: "weaningDate", label: t.colWeaningDate, type: "date", className: "text-center" },
              { key: "alive", label: t.colAlive, type: "number", className: "text-center" },
              { key: "dead", label: t.colDead, type: "number", className: "text-center" },
              { key: "weanedCount", label: t.colWeanedCount, type: "number", className: "text-center" },
              { key: "weaningWeight", label: t.colWeaningWeight, type: "number", className: "text-center" },
              { key: "survivalRate", label: t.colSurvivalRate, type: "number", className: "hidden text-center sm:table-cell" },
            ]}
            rows={weaningLog.map((l, i) => {
              // Denominator is the kits she actually raised (survivors + those
              // lost while nursing), not the surviving count — see
              // kit-mortality.ts. Null for cycles predating bornDeadAtKindling.
              const r = weaningSurvivalRate(l);
              return {
                key: l.id,
                sortValues: {
                  doeTag: l.doe.tagId,
                  breed: l.doe.breed,
                  buckTag: l.buck?.tagId,
                  kindlingDate: l.kindlingDate,
                  weaningDate: l.weaningDate,
                  alive: l.bornAlive,
                  dead: l.bornDead,
                  weanedCount: l.weaned,
                  weaningWeight: l.weaningWeightGrams,
                  survivalRate: r,
                },
                node: (
                  <TableRow key={l.id} className="[&>td]:border-x [&>td]:text-center">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/rabbits/${l.doe.id}`} className="hover:underline">
                        {l.doe.tagId ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{l.doe.breed ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{l.buck?.tagId ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <LocalDate date={l.kindlingDate} locale={locale} />
                    </TableCell>
                    <TableCell>
                      <LocalDate date={l.weaningDate} locale={locale} />
                    </TableCell>
                    <TableCell>{l.bornAlive}</TableCell>
                    <TableCell>{l.bornDead || "—"}</TableCell>
                    <TableCell>{l.weaned ?? "—"}</TableCell>
                    <TableCell>{l.weaningWeightGrams ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {r != null ? (
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          {Math.round(r * 100)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ),
              };
            })}
          />
        </div>
      )}
    </div>
  );
}
