import Link from "next/link";
import { Droplets } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

export type ResorptionLogRow = {
  id: string;
  matingDate: Date;
  resorptionDate: Date;
  doe: { id: string; tagId: string | null; breed: string | null };
  buck: { tagId: string | null } | null;
};

/** "سجل الامتصاص": every recorded resorption event, most recent first. */
export function ResorptionLog({
  resorptionLog,
  locale,
  t,
}: {
  resorptionLog: ResorptionLogRow[];
  locale: Locale;
  t: Dictionary["resorptionLog"];
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{t.logHeading}</h2>
      {resorptionLog.length === 0 ? (
        <EmptyState icon={Droplets} title={t.logEmptyTitle} description={t.logEmptyDescription} />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            columns={[
              { key: "index", label: t.colIndex, className: "text-center", sortable: false },
              { key: "doeTag", label: t.colMotherTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.colBreed, type: "string", className: "hidden text-center sm:table-cell" },
              { key: "buckTag", label: t.colBuckTag, type: "tag", className: "text-center" },
              { key: "matingDate", label: t.colMatingDate, type: "date", className: "text-center" },
              { key: "resorptionDate", label: t.colResorptionDate, type: "date", className: "text-center" },
            ]}
            rows={resorptionLog.map((row, i) => ({
              key: row.id,
              sortValues: {
                doeTag: row.doe.tagId,
                breed: row.doe.breed,
                buckTag: row.buck?.tagId,
                matingDate: row.matingDate,
                resorptionDate: row.resorptionDate,
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
                    <LocalDate date={row.resorptionDate} locale={locale} />
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
