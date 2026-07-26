import { Layers } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import type { LocalDeceasedRabbit, LocalKitDeath } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";

export function MortalityLog({
  deceasedRabbits,
  kitDeaths,
  locale,
  todayOnly,
}: {
  deceasedRabbits: LocalDeceasedRabbit[];
  kitDeaths: LocalKitDeath[];
  locale: Locale;
  todayOnly?: boolean;
}) {
  // Two tables, not one with a «المرحلة» column: نافق النتاج is a loss on a
  // named mother's litter, نافق الفطام is a deduction from the farm-wide رصيد
  // الفطام with no mother at all.
  const nursingKitDeaths = kitDeaths.filter((r) => r.stage === "nursing");
  const weanedKitDeaths = kitDeaths.filter((r) => r.stage === "weaned");
  // Rows are presses, not kits — five kits lost in one press is one row.
  const sumKits = (rows: LocalKitDeath[]) => rows.reduce((sum, r) => sum + r.count, 0);
  const kitSort = useSortableRows(nursingKitDeaths, {
    date: { type: "date", value: (r) => r.date },
    tag: { type: "tag", value: (r) => r.doeTag },
    count: { type: "number", value: (r) => r.count },
  });
  const weanedKitSort = useSortableRows(weanedKitDeaths, {
    date: { type: "date", value: (r) => r.date },
    count: { type: "number", value: (r) => r.count },
  });
  const deceasedSort = useSortableRows(deceasedRabbits, {
    date: { type: "date", value: (r) => r.updatedAt },
    tag: { type: "tag", value: (r) => r.retiredTagId ?? r.tagId },
    breed: { type: "string", value: (r) => r.breed },
    sex: { type: "string", value: (r) => r.sex },
  });

  return (
    <>
    {/* نافق النتاج — الرضع عند الأم (kit_death_log) */}
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        {locale === "ar" ? "نافق النتاج" : "Nursing kit deaths"}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
        {sumKits(nursingKitDeaths) > 0 && (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-bold tabular-nums text-primary">
            {sumKits(nursingKitDeaths).toLocaleString()}
          </span>
        )}
      </h2>
      {nursingKitDeaths.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
          <Layers className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">
            {locale === "ar" ? "لا يوجد نافق نتاج مسجل" : "No nursing kit deaths recorded"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right border-collapse">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr className="[&>th]:border-x">
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "تاريخ النفوق" : "Date of death"}
                  sortKey="date"
                  activeSortKey={kitSort.sortKey}
                  direction={kitSort.direction}
                  onSort={kitSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "رقم الأم" : "Mother"}
                  sortKey="tag"
                  activeSortKey={kitSort.sortKey}
                  direction={kitSort.direction}
                  onSort={kitSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "العدد" : "Count"}
                  sortKey="count"
                  activeSortKey={kitSort.sortKey}
                  direction={kitSort.direction}
                  onSort={kitSort.toggleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {kitSort.sorted.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-4 py-3.5">
                    <LocalDate date={new Date(entry.date)} />
                  </td>
                  <td className="px-4 py-3.5 font-bold">{entry.doeTag ?? "—"}</td>
                  <td className="px-4 py-3.5 font-bold tabular-nums">{entry.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {/* نافق الفطام — خصم من رصيد الفطام (kit_stock_movement) */}
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        {locale === "ar" ? "نافق الفطام" : "Weaned kit deaths"}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
        {sumKits(weanedKitDeaths) > 0 && (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-bold tabular-nums text-primary">
            {sumKits(weanedKitDeaths).toLocaleString()}
          </span>
        )}
      </h2>
      {weanedKitDeaths.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
          <Layers className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">
            {locale === "ar" ? "لا يوجد نافق فطام مسجل" : "No weaned kit deaths recorded"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right border-collapse">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr className="[&>th]:border-x">
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "تاريخ النفوق" : "Date of death"}
                  sortKey="date"
                  activeSortKey={weanedKitSort.sortKey}
                  direction={weanedKitSort.direction}
                  onSort={weanedKitSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "العدد" : "Count"}
                  sortKey="count"
                  activeSortKey={weanedKitSort.sortKey}
                  direction={weanedKitSort.direction}
                  onSort={weanedKitSort.toggleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {weanedKitSort.sorted.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-4 py-3.5">
                    <LocalDate date={new Date(entry.date)} />
                  </td>
                  <td className="px-4 py-3.5 font-bold tabular-nums">{entry.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    <div className="space-y-3">
      <h2 className="text-lg font-bold">
        {locale === "ar" ? "سجل حالات النفوق" : "Mortality History Log"}
        {todayOnly ? (locale === "ar" ? " النهاردة" : " (Today)") : ""}
      </h2>
      {deceasedRabbits.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
          <Layers className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">{locale === "ar" ? "لا توجد حالات نفوق مسجلة" : "No deceased records logged"}</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right border-collapse">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr className="[&>th]:border-x">
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "التاريخ" : "Date"}
                  sortKey="date"
                  activeSortKey={deceasedSort.sortKey}
                  direction={deceasedSort.direction}
                  onSort={deceasedSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "رقم الأرنب" : "Rabbit Tag ID"}
                  sortKey="tag"
                  activeSortKey={deceasedSort.sortKey}
                  direction={deceasedSort.direction}
                  onSort={deceasedSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "السلالة" : "Breed"}
                  sortKey="breed"
                  activeSortKey={deceasedSort.sortKey}
                  direction={deceasedSort.direction}
                  onSort={deceasedSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "الجنس" : "Sex"}
                  sortKey="sex"
                  activeSortKey={deceasedSort.sortKey}
                  direction={deceasedSort.direction}
                  onSort={deceasedSort.toggleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {deceasedSort.sorted.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-4 py-3.5 text-center">
                    <LocalDate date={new Date(entry.updatedAt)} />
                  </td>
                  <td className="px-4 py-3.5 font-bold">{entry.retiredTagId ?? entry.tagId ?? "—"}</td>
                  <td className="px-4 py-3.5">{entry.breed ?? "—"}</td>
                  <td className="px-4 py-3.5">
                    {entry.sex === "doe" ? (locale === "ar" ? "أنثى" : "Doe") : (locale === "ar" ? "ذكر" : "Buck")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </>
  );
}
