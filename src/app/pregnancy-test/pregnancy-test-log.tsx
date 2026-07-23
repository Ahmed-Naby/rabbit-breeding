import Link from "next/link";
import { Microscope } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { LocalDate } from "@/components/local-date";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

const RESULT_CLS: Record<string, string> = {
  positive:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  negative:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

export type PregnancyTestLogRow = {
  id: string;
  matingDate: Date | null;
  testDate: Date;
  result: string;
  doe: { id: string; tagId: string | null; breed: string | null };
  buck: { tagId: string | null } | null;
};

/** "سجل الجس": every recorded pregnancy-test result, most recent first. */
export function PregnancyTestLog({
  testLog,
  locale,
  t,
  todayOnly,
}: {
  testLog: PregnancyTestLogRow[];
  locale: Locale;
  t: Dictionary["pregnancyTest"];
  todayOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">
        {t.logHeading}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
      </h2>
      {testLog.length === 0 ? (
        <EmptyState icon={Microscope} title={t.logEmptyTitle} description={t.logEmptyDescription} />
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
              { key: "testDate", label: t.colTestDate, type: "date", className: "text-center" },
              { key: "result", label: t.colTestResult, type: "string", className: "text-center" },
            ]}
            rows={testLog.map((row, i) => ({
              key: row.id,
              sortValues: {
                doeTag: row.doe.tagId,
                breed: row.doe.breed,
                buckTag: row.buck?.tagId,
                matingDate: row.matingDate,
                testDate: row.testDate,
                result: row.result,
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
                    <LocalDate date={row.testDate} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                        RESULT_CLS[row.result]
                      )}
                    >
                      {row.result === "positive"
                        ? t.resultPositive
                        : row.result === "negative"
                          ? t.resultNegative
                          : row.result}
                    </span>
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
