import type { Locale } from "@/lib/i18n/locales";
import type { KindlingLogEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { SortableTh } from "@/components/sortable-th";
import { TablePager } from "@/components/ui/table-pager";
import { LogCountBadge, LogStatBadge } from "@/components/log-count-badge";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { useSortableRows } from "@/lib/use-sortable-rows";

// Read-only archive (سجل الولادة): counts are entered/adjusted on the daily
// الأمهات board; each row here is frozen at the birth and never edited.
export function KindlingLog({
  kindlingLog,
  locale,
  todayOnly,
}: {
  kindlingLog: KindlingLogEntry[];
  locale: Locale;
  todayOnly?: boolean;
}) {
  const logSort = useSortableRows(kindlingLog, {
    tag: { type: "tag", value: (r) => r.doeTagId },
    breed: { type: "string", value: (r) => r.doeBreed },
    buckTag: { type: "tag", value: (r) => r.buckTagId },
    matingDate: { type: "date", value: (r) => r.matingDate },
    kindlingDate: { type: "date", value: (r) => r.kindlingDate },
    bornAlive: { type: "number", value: (r) => r.bornAliveAtKindling },
    bornDead: { type: "number", value: (r) => (r.bornDeadAtKindling >= 0 ? r.bornDeadAtKindling : null) },
  });

  const kt = getClientDictionary(locale).kindling;
  // Live kits at birth only — see the web log for why النافق stays out of both
  // badges and why this reads the frozen column.
  const totalKits = kindlingLog.reduce((sum, r) => sum + r.bornAliveAtKindling, 0);
  const avgLitter = kindlingLog.length === 0 ? 0 : totalKits / kindlingLog.length;

  return (
    <div className="space-y-3">
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">
        {locale === "ar" ? "سجل الولادة" : "Kindling Log"}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
        <LogCountBadge count={kindlingLog.length} />
        {kindlingLog.length > 0 && (
          <>
            <LogStatBadge label={kt.totalKitsBadge} value={totalKits.toLocaleString()} />
            <LogStatBadge label={kt.avgLitterBadge} value={avgLitter.toFixed(1)} />
          </>
        )}
      </h2>
      {kindlingLog.length === 0 ? (
        <p className="text-sm text-muted-foreground">{locale === "ar" ? "لا توجد سجلات ولادة بعد." : "No kindling logs yet."}</p>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr className="[&>th]:border-x">
                <th className="px-4 py-3 w-12 text-center">{locale === "ar" ? "م" : "No."}</th>
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "رقم الأم" : "Doe ID"}
                  sortKey="tag"
                  activeSortKey={logSort.sortKey}
                  direction={logSort.direction}
                  onSort={logSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "النوع" : "Breed"}
                  sortKey="breed"
                  activeSortKey={logSort.sortKey}
                  direction={logSort.direction}
                  onSort={logSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "رقم الذكر" : "Buck ID"}
                  sortKey="buckTag"
                  activeSortKey={logSort.sortKey}
                  direction={logSort.direction}
                  onSort={logSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "تاريخ التلقيح" : "Mating Date"}
                  sortKey="matingDate"
                  activeSortKey={logSort.sortKey}
                  direction={logSort.direction}
                  onSort={logSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "تاريخ الولادة" : "Kindling Date"}
                  sortKey="kindlingDate"
                  activeSortKey={logSort.sortKey}
                  direction={logSort.direction}
                  onSort={logSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "أحياء" : "Born Alive"}
                  sortKey="bornAlive"
                  activeSortKey={logSort.sortKey}
                  direction={logSort.direction}
                  onSort={logSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "نافق" : "Born Dead"}
                  sortKey="bornDead"
                  activeSortKey={logSort.sortKey}
                  direction={logSort.direction}
                  onSort={logSort.toggleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {logSort.paged.map((log, index) => (
                <tr key={log.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-4 py-3.5 text-center text-muted-foreground font-medium">{logSort.page * logSort.pageSize + index + 1}</td>
                  <td className="px-4 py-3.5 font-bold">{log.doeTagId ?? "—"}</td>
                  <td className="px-4 py-3.5 hidden md:table-cell">{log.doeBreed ?? "—"}</td>
                  <td className="px-4 py-3.5 font-bold">{log.buckTagId ?? "—"}</td>
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    {log.matingDate ? <LocalDate date={log.matingDate} /> : "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    <LocalDate date={log.kindlingDate} />
                  </td>
                  <td className="px-4 py-3.5 text-center font-bold">{log.bornAliveAtKindling}</td>
                  {/* «—» distinguishes "predates the column" from a real 0. */}
                  <td className="px-4 py-3.5 text-center">
                    {log.bornDeadAtKindling >= 0 ? log.bornDeadAtKindling || "—" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager
            page={logSort.page}
            total={logSort.sorted.length}
            pageSize={logSort.pageSize}
            onPageChange={logSort.setPage}
            locale={locale}
          />
        </div>
      )}
    </div>
  );
}
