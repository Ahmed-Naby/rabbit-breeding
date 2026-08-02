import type { Locale } from "@/lib/i18n/locales";
import type { MatingLogEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { DoeStateBadge } from "../components/doe-state-menu";
import { SortableTh } from "@/components/sortable-th";
import { TablePager } from "@/components/ui/table-pager";
import { LogCountBadge } from "@/components/log-count-badge";
import { useSortableRows } from "@/lib/use-sortable-rows";
import { ExportXlsxButton } from "@/components/export-xlsx-button";
import { saveBinaryFile } from "../lib/save-file";

export function MatingLog({
  matingLog,
  locale,
  todayOnly,
}: {
  matingLog: MatingLogEntry[];
  locale: Locale;
  todayOnly?: boolean;
}) {
  const matingLogSort = useSortableRows(matingLog, {
    tag: { type: "tag", value: (r) => r.doeTagId },
    breed: { type: "string", value: (r) => r.doeBreed },
    buckTag: { type: "tag", value: (r) => r.buckTagId },
    matingDate: { type: "date", value: (r) => r.matingDate },
    doeState: { type: "string", value: (r) => (r.wasNursingAtMating ? "nursing" : "empty") },
  });

  return (
    <div className="space-y-3">
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">
        {locale === "ar" ? "سجل التلقيح" : "Mating Log"}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
        <LogCountBadge count={matingLog.length} />
        {/* saveBinaryFile, not a Blob download: on Android a <a download>
            silently does nothing, so the file has to go through the share
            sheet. */}
        <ExportXlsxButton
          className="ms-auto"
          locale={locale}
          save={saveBinaryFile}
          spec={{
            kind: "mating",
            rows: matingLog.map((r) => ({
              doeTag: r.doeTagId,
              breed: r.doeBreed,
              buckTag: r.buckTagId,
              matingDate: r.matingDate,
              wasNursingAtMating: r.wasNursingAtMating,
            })),
          }}
        />
      </h2>
      {matingLog.length === 0 ? (
        <p className="text-sm text-muted-foreground">{locale === "ar" ? "لا يوجد سجل تلقيح بعد." : "No mating log yet."}</p>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <TablePager
            page={matingLogSort.page}
            total={matingLogSort.sorted.length}
            pageSize={matingLogSort.pageSize}
            onPageChange={matingLogSort.setPage}
            locale={locale}
            placement="top"
          />
          <table className="w-full border-collapse text-sm text-left rtl:text-right [&_td]:border [&_td]:border-border [&_th]:border [&_th]:border-border">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 w-12 text-center">{locale === "ar" ? "م" : "No."}</th>
                <SortableTh
                  label={locale === "ar" ? "رقم الأم" : "Doe ID"}
                  sortKey="tag"
                  activeSortKey={matingLogSort.sortKey}
                  direction={matingLogSort.direction}
                  onSort={matingLogSort.toggleSort}
                  className="px-4 py-3"
                />
                <SortableTh
                  label={locale === "ar" ? "النوع" : "Breed"}
                  sortKey="breed"
                  activeSortKey={matingLogSort.sortKey}
                  direction={matingLogSort.direction}
                  onSort={matingLogSort.toggleSort}
                  className="px-4 py-3 hidden md:table-cell"
                />
                <SortableTh
                  label={locale === "ar" ? "رقم الذكر" : "Buck ID"}
                  sortKey="buckTag"
                  activeSortKey={matingLogSort.sortKey}
                  direction={matingLogSort.direction}
                  onSort={matingLogSort.toggleSort}
                  className="px-4 py-3"
                />
                <SortableTh
                  label={locale === "ar" ? "تاريخ التلقيح" : "Mating Date"}
                  sortKey="matingDate"
                  activeSortKey={matingLogSort.sortKey}
                  direction={matingLogSort.direction}
                  onSort={matingLogSort.toggleSort}
                  className="px-4 py-3"
                />
                <SortableTh
                  label={locale === "ar" ? "حالة الأم عند التلقيح" : "Doe state at mating"}
                  sortKey="doeState"
                  activeSortKey={matingLogSort.sortKey}
                  direction={matingLogSort.direction}
                  onSort={matingLogSort.toggleSort}
                  className="px-4 py-3"
                />
              </tr>
            </thead>
            <tbody>
              {matingLogSort.paged.map((log, index) => (
                <tr key={log.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3.5 text-center text-muted-foreground font-medium">{matingLogSort.page * matingLogSort.pageSize + index + 1}</td>
                  <td className="px-4 py-3.5 font-bold">{log.doeTagId ?? "—"}</td>
                  <td className="px-4 py-3.5 hidden md:table-cell">{log.doeBreed ?? "—"}</td>
                  <td className="px-4 py-3.5 font-bold">{log.buckTagId ?? "—"}</td>
                  <td className="px-4 py-3.5">
                    <LocalDate date={log.matingDate} />
                  </td>
                  <td className="px-4 py-3.5">
                    <DoeStateBadge current={log.wasNursingAtMating ? "nursing" : "empty"} locale={locale} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager
            page={matingLogSort.page}
            total={matingLogSort.sorted.length}
            pageSize={matingLogSort.pageSize}
            onPageChange={matingLogSort.setPage}
            locale={locale}
          />
        </div>
      )}
    </div>
  );
}
