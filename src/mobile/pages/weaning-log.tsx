import type { Locale } from "@/lib/i18n/locales";
import type { WeanedLitterLogEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { SortableTh } from "@/components/sortable-th";
import { TablePager } from "@/components/ui/table-pager";
import { LogCountBadge, LogStatBadge } from "@/components/log-count-badge";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { useSortableRows } from "@/lib/use-sortable-rows";
// Shared with the web table rather than redefined here — this file used to
// carry its own copy of the survival formula, which meant every change to the
// rule had to be made twice.
import { deadDuringBreeding, weaningSurvivalRate } from "@/lib/kit-mortality";

// Read-only archive (سجل الفطام): weaned count and weaning weight are entered
// on the daily الأمهات board; each row here is frozen at weaning, never edited.
export function WeaningLog({
  weanedLog,
  locale,
  todayOnly,
}: {
  weanedLog: WeanedLitterLogEntry[];
  locale: Locale;
  todayOnly?: boolean;
}) {
  const weanedLogSort = useSortableRows(weanedLog, {
    doeTag: { type: "tag", value: (r) => r.doeTagId },
    breed: { type: "string", value: (r) => r.doeBreed },
    buckTag: { type: "tag", value: (r) => r.buckTagId },
    kindlingDate: { type: "date", value: (r) => r.kindlingDate },
    weaningDate: { type: "date", value: (r) => r.weaningDate },
    alive: { type: "number", value: (r) => r.bornAlive },
    // Nursing deaths only — r.bornDead also holds the kindling's stillborns,
    // which belong to the ولادة log, not to what she raised. Keeps أحياء +
    // نافق adding up to the «عدد الرعاية» banner, as on the web log.
    dead: { type: "number", value: (r) => deadDuringBreeding(r) },
    weanedCount: { type: "number", value: (r) => r.weaned },
    weaningWeight: { type: "number", value: (r) => r.weaningWeightGrams },
    survivalRate: { type: "number", value: (r) => weaningSurvivalRate(r) },
  });

  const wt = getClientDictionary(locale).weaning;
  // Rows with no weaned count yet («—») contribute nothing — see the web log.
  const totalWeaned = weanedLog.reduce((sum, l) => sum + (l.weaned ?? 0), 0);
  // Averaged over the rows that carry a count — see the web log.
  const countedRows = weanedLog.filter((l) => l.weaned != null).length;
  const avgWeaned = countedRows === 0 ? 0 : totalWeaned / countedRows;

  return (
    <div className="space-y-3">
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">
        {locale === "ar" ? "سجل الفطام" : "Weaning Log"}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
        <LogCountBadge count={weanedLog.length} />
        {weanedLog.length > 0 && (
          <>
            <LogStatBadge label={wt.totalWeanedBadge} value={totalWeaned.toLocaleString()} />
            {countedRows > 0 && <LogStatBadge label={wt.avgWeanedBadge} value={avgWeaned.toFixed(1)} />}
          </>
        )}
      </h2>
      {weanedLog.length === 0 ? (
        <p className="text-sm text-muted-foreground">{locale === "ar" ? "لا توجد سجلات فطام بعد." : "No weaning logs yet."}</p>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <TablePager
            page={weanedLogSort.page}
            total={weanedLogSort.sorted.length}
            pageSize={weanedLogSort.pageSize}
            onPageChange={weanedLogSort.setPage}
            locale={locale}
            placement="top"
          />
          <table className="w-full text-sm text-left rtl:text-right">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              {/* Banner over أحياء + نافق, mirroring the web log: the two are
                  live counts kept in step through nursing, not birth figures.
                  Spans follow the header row below, hidden classes included,
                  so the two rows stay aligned on a phone. */}
              <tr className="[&>th]:border-x">
                <th colSpan={2} />
                <th colSpan={3} className="hidden md:table-cell" />
                <th />
                <th colSpan={2} className="px-2 py-2 md:px-4 md:py-3 text-center font-semibold">
                  {wt.groupNursingCount}
                </th>
                <th colSpan={2} />
                <th className="hidden md:table-cell" />
              </tr>
              <tr className="[&>th]:border-x">
                <th className="px-2 py-2 md:px-4 md:py-3 w-8 md:w-12 text-center">{locale === "ar" ? "م" : "No."}</th>
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={locale === "ar" ? "رقم الأم" : "Doe ID"}
                  sortKey="doeTag"
                  activeSortKey={weanedLogSort.sortKey}
                  direction={weanedLogSort.direction}
                  onSort={weanedLogSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "النوع" : "Breed"}
                  sortKey="breed"
                  activeSortKey={weanedLogSort.sortKey}
                  direction={weanedLogSort.direction}
                  onSort={weanedLogSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "رقم الذكر" : "Buck ID"}
                  sortKey="buckTag"
                  activeSortKey={weanedLogSort.sortKey}
                  direction={weanedLogSort.direction}
                  onSort={weanedLogSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "تاريخ الولادة" : "Kindling Date"}
                  sortKey="kindlingDate"
                  activeSortKey={weanedLogSort.sortKey}
                  direction={weanedLogSort.direction}
                  onSort={weanedLogSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={locale === "ar" ? "تاريخ الفطام" : "Weaning Date"}
                  sortKey="weaningDate"
                  activeSortKey={weanedLogSort.sortKey}
                  direction={weanedLogSort.direction}
                  onSort={weanedLogSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={locale === "ar" ? "أحياء" : "Alive"}
                  sortKey="alive"
                  activeSortKey={weanedLogSort.sortKey}
                  direction={weanedLogSort.direction}
                  onSort={weanedLogSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={locale === "ar" ? "نافق" : "Dead"}
                  sortKey="dead"
                  activeSortKey={weanedLogSort.sortKey}
                  direction={weanedLogSort.direction}
                  onSort={weanedLogSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={locale === "ar" ? "عدد المفطومين" : "Weaned Count"}
                  sortKey="weanedCount"
                  activeSortKey={weanedLogSort.sortKey}
                  direction={weanedLogSort.direction}
                  onSort={weanedLogSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={locale === "ar" ? "وزن الفطام (جم)" : "Weaning Weight (g)"}
                  sortKey="weaningWeight"
                  activeSortKey={weanedLogSort.sortKey}
                  direction={weanedLogSort.direction}
                  onSort={weanedLogSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "نسبة النجاح" : "Survival Rate"}
                  sortKey="survivalRate"
                  activeSortKey={weanedLogSort.sortKey}
                  direction={weanedLogSort.direction}
                  onSort={weanedLogSort.toggleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {weanedLogSort.paged.map((log, index) => {
                const rate = weaningSurvivalRate(log);

                return (
                  <tr key={log.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-2 py-2 md:px-4 md:py-3.5 text-center text-muted-foreground font-medium">{weanedLogSort.page * weanedLogSort.pageSize + index + 1}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 font-bold">{log.doeTagId ?? "—"}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 hidden md:table-cell">{log.doeBreed ?? "—"}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 hidden md:table-cell font-bold">{log.buckTagId ?? "—"}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 hidden md:table-cell">
                      <LocalDate date={log.kindlingDate} />
                    </td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5">
                      <LocalDate date={log.weaningDate} />
                    </td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 text-center">{log.bornAlive}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 text-center">{deadDuringBreeding(log) || "—"}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 text-center font-bold">{log.weaned ?? "—"}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 text-center">{log.weaningWeightGrams ?? "—"}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 hidden md:table-cell text-center font-semibold">
                      {rate != null ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {Math.round(rate * 100)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <TablePager
            page={weanedLogSort.page}
            total={weanedLogSort.sorted.length}
            pageSize={weanedLogSort.pageSize}
            onPageChange={weanedLogSort.setPage}
            locale={locale}
          />
        </div>
      )}
    </div>
  );
}
