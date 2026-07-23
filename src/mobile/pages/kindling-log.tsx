import type { Locale } from "@/lib/i18n/locales";
import type { KindlingLogEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { LitterCountInput } from "../components/doe-state-menu";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";

export function KindlingLog({
  kindlingLog,
  locale,
  onDone,
  todayOnly,
}: {
  kindlingLog: KindlingLogEntry[];
  locale: Locale;
  onDone: () => void;
  todayOnly?: boolean;
}) {
  const logSort = useSortableRows(kindlingLog, {
    tag: { type: "tag", value: (r) => r.doeTagId },
    breed: { type: "string", value: (r) => r.doeBreed },
    buckTag: { type: "tag", value: (r) => r.buckTagId },
    matingDate: { type: "date", value: (r) => r.matingDate },
    kindlingDate: { type: "date", value: (r) => r.kindlingDate },
    bornAlive: { type: "number", value: (r) => r.bornAlive },
    bornDead: { type: "number", value: (r) => r.bornDead },
  });

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">
        {locale === "ar" ? "سجل الولادة" : "Kindling Log"}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
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
              {logSort.sorted.map((log, index) => (
                <tr key={log.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-4 py-3.5 text-center text-muted-foreground font-medium">{index + 1}</td>
                  <td className="px-4 py-3.5 font-bold">{log.doeTagId ?? "—"}</td>
                  <td className="px-4 py-3.5 hidden md:table-cell">{log.doeBreed ?? "—"}</td>
                  <td className="px-4 py-3.5 font-bold">{log.buckTagId ?? "—"}</td>
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    {log.matingDate ? <LocalDate date={log.matingDate} /> : "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    <LocalDate date={log.kindlingDate} />
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <LitterCountInput
                      breedingId={log.breedingId}
                      field="bornAlive"
                      value={log.bornAlive}
                      locale={locale}
                      onDone={onDone}
                      className="h-6 w-10 md:h-8 md:w-16"
                    />
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <LitterCountInput
                      breedingId={log.breedingId}
                      field="bornDead"
                      value={log.bornDead}
                      locale={locale}
                      onDone={onDone}
                      className="h-6 w-10 md:h-8 md:w-16"
                    />
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
