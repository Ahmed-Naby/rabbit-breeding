import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { LogCountBadge, LogStatBadge } from "@/components/log-count-badge";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

export type KindlingLogRow = {
  id: string;
  matingDate: Date | null;
  kindlingDate: Date;
  /** Live kits at the ولادة press, frozen — never touched by fostering. */
  bornAliveAtKindling: number;
  /** Stillborn at the ولادة press, frozen. `-1` = row predates the column. */
  bornDeadAtKindling: number;
  doe: { id: string; tagId: string | null; breed: string | null };
  buck: { tagId: string | null } | null;
};

/**
 * "سجل الولادة": a permanent, read-only archive of every recorded kindling,
 * most recent first. The أحياء/نافق counts are entered on the الأمهات (does)
 * board while the litter is live and mirrored here one-way — this log never
 * edits or deletes a row.
 */
export function KindlingLog({
  kindlingLog,
  locale,
  t,
  todayOnly,
}: {
  kindlingLog: KindlingLogRow[];
  locale: Locale;
  t: Dictionary["kindling"];
  todayOnly?: boolean;
}) {
  // Live kits at birth only: النافق is kept out of both badges (so متوسط البطن
  // reads as live kits per kindling), and the frozen column is used so a later
  // fostering or nursing death can't rewrite what the doe actually produced.
  const totalKits = kindlingLog.reduce((sum, r) => sum + r.bornAliveAtKindling, 0);
  const avgLitter = kindlingLog.length === 0 ? 0 : totalKits / kindlingLog.length;

  return (
    <div className="space-y-3">
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
        {t.logHeading}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
        <LogCountBadge count={kindlingLog.length} />
        {kindlingLog.length > 0 && (
          <>
            <LogStatBadge label={t.totalKitsBadge} value={totalKits.toLocaleString()} />
            <LogStatBadge label={t.avgLitterBadge} value={avgLitter.toFixed(1)} />
          </>
        )}
      </h2>
      {kindlingLog.length === 0 ? (
        <EmptyState icon={HeartPulse} title={t.logEmptyTitle} description={t.logEmptyDescription} />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            paginate
            locale={locale}
            columns={[
              { key: "index", label: t.colIndex, className: "text-center", sortable: false },
              { key: "doeTag", label: t.colDoeTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.colBreed, type: "string", className: "hidden text-center sm:table-cell" },
              { key: "buckTag", label: t.colBuckTag, type: "tag", className: "hidden text-center sm:table-cell" },
              { key: "matingDate", label: t.colMatingDate, type: "date", className: "hidden text-center sm:table-cell" },
              { key: "kindlingDate", label: t.colKindlingDate, type: "date", className: "text-center" },
              { key: "bornAlive", label: t.colBornAlive, type: "number", className: "text-center" },
              { key: "bornDead", label: t.colBornDead, type: "number", className: "text-center" },
            ]}
            rows={kindlingLog.map((row, i) => ({
              key: row.id,
              sortValues: {
                doeTag: row.doe.tagId,
                breed: row.doe.breed,
                buckTag: row.buck?.tagId,
                matingDate: row.matingDate,
                kindlingDate: row.kindlingDate,
                bornAlive: row.bornAliveAtKindling,
                bornDead: row.bornDeadAtKindling >= 0 ? row.bornDeadAtKindling : null,
              },
              node: (
                <TableRow key={row.id} className="[&>td]:border-x [&>td]:text-center">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/rabbits/${row.doe.id}`} className="hover:underline">
                      {row.doe.tagId ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{row.doe.breed ?? "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell">{row.buck?.tagId ?? "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <LocalDate date={row.matingDate} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <LocalDate date={row.kindlingDate} locale={locale} />
                  </TableCell>
                  <TableCell>{row.bornAliveAtKindling}</TableCell>
                  {/* «—» distinguishes "predates the column" from a real 0. */}
                  <TableCell>{row.bornDeadAtKindling >= 0 ? row.bornDeadAtKindling || "—" : "—"}</TableCell>
                </TableRow>
              ),
            }))}
          />
        </div>
      )}
    </div>
  );
}
