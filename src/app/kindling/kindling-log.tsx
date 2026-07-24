import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

export type KindlingLogRow = {
  id: string;
  matingDate: Date | null;
  kindlingDate: Date;
  bornAlive: number;
  bornDead: number;
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
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">
        {t.logHeading}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
      </h2>
      {kindlingLog.length === 0 ? (
        <EmptyState icon={HeartPulse} title={t.logEmptyTitle} description={t.logEmptyDescription} />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
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
                bornAlive: row.bornAlive,
                bornDead: row.bornDead,
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
                  <TableCell>{row.bornAlive}</TableCell>
                  <TableCell>{row.bornDead || "—"}</TableCell>
                </TableRow>
              ),
            }))}
          />
        </div>
      )}
    </div>
  );
}
