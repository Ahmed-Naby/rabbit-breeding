import type { Locale } from "@/lib/i18n/locales";
import type { MatingLogEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { DoeStateBadge } from "../components/doe-state-menu";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";

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
      <h2 className="text-lg font-bold">
        {locale === "ar" ? "سجل التلقيح" : "Mating Log"}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
      </h2>
      {matingLog.length === 0 ? (
        <p className="text-sm text-muted-foreground">{locale === "ar" ? "لا يوجد سجل تلقيح بعد." : "No mating log yet."}</p>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
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
              {matingLogSort.sorted.map((log, index) => (
                <tr key={log.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3.5 text-center text-muted-foreground font-medium">{index + 1}</td>
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
        </div>
      )}
    </div>
  );
}
