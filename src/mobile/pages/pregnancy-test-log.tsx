import type { Locale } from "@/lib/i18n/locales";
import type { PregnancyTestLogEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { cn } from "@/lib/utils";
import { SortableTh } from "@/components/sortable-th";
import { TablePager } from "@/components/ui/table-pager";
import { LogCountBadge, LogStatBadge } from "@/components/log-count-badge";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { useSortableRows } from "@/lib/use-sortable-rows";

const RESULT_CLS: Record<string, string> = {
  positive:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  negative:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

export function PregnancyTestLog({
  testLog,
  locale,
  todayOnly,
}: {
  testLog: PregnancyTestLogEntry[];
  locale: Locale;
  todayOnly?: boolean;
}) {
  const testLogSort = useSortableRows(testLog, {
    doeTag: { type: "tag", value: (r) => r.doeTagId },
    breed: { type: "string", value: (r) => r.doeBreed },
    buckTag: { type: "tag", value: (r) => r.buckTagId },
    matingDate: { type: "date", value: (r) => r.matingDate },
    testDate: { type: "date", value: (r) => r.testDate },
    result: { type: "string", value: (r) => r.result },
  });

  const pt = getClientDictionary(locale).pregnancyTest;
  // Denominator is every logged test — see the web log for why.
  const positives = testLog.filter((r) => r.result === "positive").length;
  const fertilityRate = testLog.length === 0 ? 0 : (positives / testLog.length) * 100;

  return (
    <div className="space-y-3">
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">
        {locale === "ar" ? "سجل الجس" : "Pregnancy Test Log"}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
        <LogCountBadge count={testLog.length} />
        {testLog.length > 0 && (
          <>
            <LogStatBadge label={pt.positiveCountBadge} value={positives.toLocaleString()} />
            <LogStatBadge label={pt.fertilityRateBadge} value={`${fertilityRate.toFixed(0)}%`} />
          </>
        )}
      </h2>
      {testLog.length === 0 ? (
        <p className="text-sm text-muted-foreground">{locale === "ar" ? "لا توجد سجلات جس بعد." : "No pregnancy test logs yet."}</p>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <TablePager
            page={testLogSort.page}
            total={testLogSort.sorted.length}
            pageSize={testLogSort.pageSize}
            onPageChange={testLogSort.setPage}
            locale={locale}
            placement="top"
          />
          <table className="w-full text-sm text-left rtl:text-right">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr className="[&>th]:border-x">
                <th className="px-4 py-3 w-12 text-center">{locale === "ar" ? "م" : "No."}</th>
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "رقم الأم" : "Doe ID"}
                  sortKey="doeTag"
                  activeSortKey={testLogSort.sortKey}
                  direction={testLogSort.direction}
                  onSort={testLogSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "النوع" : "Breed"}
                  sortKey="breed"
                  activeSortKey={testLogSort.sortKey}
                  direction={testLogSort.direction}
                  onSort={testLogSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "رقم الذكر" : "Buck ID"}
                  sortKey="buckTag"
                  activeSortKey={testLogSort.sortKey}
                  direction={testLogSort.direction}
                  onSort={testLogSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "تاريخ التلقيح" : "Mating Date"}
                  sortKey="matingDate"
                  activeSortKey={testLogSort.sortKey}
                  direction={testLogSort.direction}
                  onSort={testLogSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "تاريخ الجس" : "Test Date"}
                  sortKey="testDate"
                  activeSortKey={testLogSort.sortKey}
                  direction={testLogSort.direction}
                  onSort={testLogSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "النتيجة" : "Result"}
                  sortKey="result"
                  activeSortKey={testLogSort.sortKey}
                  direction={testLogSort.direction}
                  onSort={testLogSort.toggleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {testLogSort.paged.map((log, index) => (
                <tr key={log.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-4 py-3.5 text-center text-muted-foreground font-medium">{testLogSort.page * testLogSort.pageSize + index + 1}</td>
                  <td className="px-4 py-3.5 font-bold">{log.doeTagId ?? "—"}</td>
                  <td className="px-4 py-3.5 hidden md:table-cell">{log.doeBreed ?? "—"}</td>
                  <td className="px-4 py-3.5 font-bold">{log.buckTagId ?? "—"}</td>
                  <td className="px-4 py-3.5">
                    {log.matingDate ? <LocalDate date={log.matingDate} /> : "—"}
                  </td>
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    <LocalDate date={log.testDate} />
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider",
                        RESULT_CLS[log.result] ?? "border-zinc-300 bg-zinc-50 text-zinc-700"
                      )}
                    >
                      {log.result === "positive"
                        ? (locale === "ar" ? "عشار" : "Positive")
                        : (locale === "ar" ? "سالبة" : "Negative")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager
            page={testLogSort.page}
            total={testLogSort.sorted.length}
            pageSize={testLogSort.pageSize}
            onPageChange={testLogSort.setPage}
            locale={locale}
          />
        </div>
      )}
    </div>
  );
}
