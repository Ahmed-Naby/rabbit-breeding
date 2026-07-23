import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import { DoeStateBadge } from "../does/doe-state-menu";

export type MatingLogRow = {
  id: string;
  matingDate: Date | null;
  doe: { id: string; tagId: string | null; breed: string | null; doeState: string };
  buck: { tagId: string | null } | null;
};

/** "سجل التلقيح": every breeding attempt that has a mating date, most recent first. */
export function MatingLog({
  matingLog,
  locale,
  t,
  todayOnly,
}: {
  matingLog: MatingLogRow[];
  locale: Locale;
  t: Dictionary["mating"];
  todayOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">
        {t.logHeading}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
      </h2>
      {matingLog.length === 0 ? (
        <EmptyState icon={HeartHandshake} title={t.logEmptyTitle} description={t.logEmptyDescription} />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            columns={[
              { key: "index", label: t.colIndex, className: "text-center", sortable: false },
              { key: "tag", label: t.colMotherTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.colBreed, type: "string", className: "hidden text-center sm:table-cell" },
              { key: "buckTag", label: t.colBuckTag, type: "tag", className: "text-center" },
              { key: "matingDate", label: t.colMatingDate, type: "date", className: "text-center" },
              { key: "doeState", label: t.colDoeState, type: "string", className: "text-center" },
            ]}
            rows={matingLog.map((row, i) => ({
              key: row.id,
              sortValues: {
                tag: row.doe.tagId,
                breed: row.doe.breed,
                buckTag: row.buck?.tagId,
                matingDate: row.matingDate,
                doeState: row.doe.doeState,
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
                  <TableCell>{row.buck?.tagId ?? "—"}</TableCell>
                  <TableCell>
                    <LocalDate date={row.matingDate} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <DoeStateBadge current={row.doe.doeState} locale={locale} />
                  </TableCell>
                </TableRow>
              ),
            }))}
          />
        </div>
      )}
    </div>
  );
}
