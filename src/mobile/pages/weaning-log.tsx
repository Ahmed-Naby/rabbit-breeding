import type { Locale } from "@/lib/i18n/locales";
import type { WeanedLitterLogEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { LitterCountInput, LitterWeightInput } from "../components/doe-state-menu";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";

function survivalRate(bornAlive: number, weaned: number | null): number | null {
  if (bornAlive <= 0 || weaned === null) return null;
  return weaned / bornAlive;
}

export function WeaningLog({
  weanedLog,
  locale,
  onDone,
  todayOnly,
}: {
  weanedLog: WeanedLitterLogEntry[];
  locale: Locale;
  onDone: () => void;
  todayOnly?: boolean;
}) {
  const weanedLogSort = useSortableRows(weanedLog, {
    doeTag: { type: "tag", value: (r) => r.doeTagId },
    breed: { type: "string", value: (r) => r.doeBreed },
    buckTag: { type: "tag", value: (r) => r.buckTagId },
    kindlingDate: { type: "date", value: (r) => r.kindlingDate },
    weaningDate: { type: "date", value: (r) => r.weaningDate },
    alive: { type: "number", value: (r) => r.bornAlive },
    dead: { type: "number", value: (r) => r.bornDead },
    weanedCount: { type: "number", value: (r) => r.weaned },
    weaningWeight: { type: "number", value: (r) => r.weaningWeightGrams },
    survivalRate: { type: "number", value: (r) => survivalRate(r.bornAlive, r.weaned) },
  });

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">
        {locale === "ar" ? "سجل الفطام" : "Weaning Log"}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
      </h2>
      {weanedLog.length === 0 ? (
        <p className="text-sm text-muted-foreground">{locale === "ar" ? "لا توجد سجلات فطام بعد." : "No weaning logs yet."}</p>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
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
              {weanedLogSort.sorted.map((log, index) => {
                const rate = survivalRate(log.bornAlive, log.weaned);

                return (
                  <tr key={log.breedingId} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-2 py-2 md:px-4 md:py-3.5 text-center text-muted-foreground font-medium">{index + 1}</td>
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
                    <td className="px-2 py-2 md:px-4 md:py-3.5 text-center">{log.bornDead || "—"}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 text-center">
                      <LitterCountInput
                        breedingId={log.breedingId}
                        field="weaned"
                        value={log.weaned}
                        locale={locale}
                        className="w-9 md:w-12 mx-auto"
                        onDone={onDone}
                      />
                    </td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 text-center">
                      <LitterWeightInput
                        breedingId={log.breedingId}
                        valueGrams={log.weaningWeightGrams}
                        locale={locale}
                        className="w-12 md:w-16 mx-auto"
                        onDone={onDone}
                      />
                    </td>
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
        </div>
      )}
    </div>
  );
}
