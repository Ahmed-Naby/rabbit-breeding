import type { Locale } from "@/lib/i18n/locales";
import type { ResorptionLogEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";

export function ResorptionLog({
  resorptionLog,
  locale,
}: {
  resorptionLog: ResorptionLogEntry[];
  locale: Locale;
}) {
  const resorptionLogSort = useSortableRows(resorptionLog, {
    doeTag: { type: "tag", value: (r) => r.doeTagId },
    breed: { type: "string", value: (r) => r.doeBreed },
    buckTag: { type: "tag", value: (r) => r.buckTagId },
    matingDate: { type: "date", value: (r) => r.matingDate },
    resorptionDate: { type: "date", value: (r) => r.resorptionDate },
  });

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">{locale === "ar" ? "سجل الامتصاص" : "Resorption Log"}</h2>
      {resorptionLog.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {locale === "ar" ? "لا يوجد امتصاص مسجل بعد." : "No resorption logs yet."}
        </p>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr className="[&>th]:border-x">
                <th className="px-4 py-3 w-12 text-center">{locale === "ar" ? "م" : "No."}</th>
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "رقم الأم" : "Doe ID"}
                  sortKey="doeTag"
                  activeSortKey={resorptionLogSort.sortKey}
                  direction={resorptionLogSort.direction}
                  onSort={resorptionLogSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "النوع" : "Breed"}
                  sortKey="breed"
                  activeSortKey={resorptionLogSort.sortKey}
                  direction={resorptionLogSort.direction}
                  onSort={resorptionLogSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "رقم الذكر" : "Buck ID"}
                  sortKey="buckTag"
                  activeSortKey={resorptionLogSort.sortKey}
                  direction={resorptionLogSort.direction}
                  onSort={resorptionLogSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "تاريخ التلقيح" : "Mating Date"}
                  sortKey="matingDate"
                  activeSortKey={resorptionLogSort.sortKey}
                  direction={resorptionLogSort.direction}
                  onSort={resorptionLogSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "تاريخ الامتصاص" : "Resorption Date"}
                  sortKey="resorptionDate"
                  activeSortKey={resorptionLogSort.sortKey}
                  direction={resorptionLogSort.direction}
                  onSort={resorptionLogSort.toggleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {resorptionLogSort.sorted.map((log, index) => (
                <tr key={log.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-4 py-3.5 text-center text-muted-foreground font-medium">{index + 1}</td>
                  <td className="px-4 py-3.5 font-bold">{log.doeTagId ?? "—"}</td>
                  <td className="px-4 py-3.5 hidden md:table-cell">{log.doeBreed ?? "—"}</td>
                  <td className="px-4 py-3.5 font-bold">{log.buckTagId ?? "—"}</td>
                  <td className="px-4 py-3.5">
                    <LocalDate date={log.matingDate} />
                  </td>
                  <td className="px-4 py-3.5">
                    <LocalDate date={log.resorptionDate} />
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
