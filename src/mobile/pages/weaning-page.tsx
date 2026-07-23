import { useEffect, useState, useCallback } from "react";
import { Milk } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchWeaningPageData, type WeaningLitterRow, type WeanedLitterLogEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { DoeStateBadge, WeanButton } from "../components/doe-state-menu";
import { weaningDueDate, isToday } from "@/lib/dates";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";
import { WeaningLog } from "./weaning-log";

export function WeaningPage({ locale, hideHeader }: { locale: Locale; hideHeader?: boolean }) {
  const t = getClientDictionary(locale);
  const [data, setData] = useState<{
    litters: WeaningLitterRow[];
    weanedLog: WeanedLitterLogEntry[];
    weaningDays: number;
  } | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchWeaningPageData(db);
    setData({
      litters: res.litters,
      weanedLog: res.weanedLog,
      weaningDays: res.settings.weaningDays,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const litters = data?.litters ?? [];
  const weanedLog = (data?.weanedLog ?? []).filter((entry) => isToday(entry.weaningDate));
  const weaningDays = data?.weaningDays ?? 0;

  const littersSort = useSortableRows(litters, {
    doeTag: { type: "tag", value: (r) => r.doeTagId },
    breed: { type: "string", value: (r) => r.doeBreed },
    buckTag: { type: "tag", value: (r) => r.buckTagId },
    kindlingDate: { type: "date", value: (r) => r.kindlingDate },
    dueDate: { type: "date", value: (r) => weaningDueDate(new Date(r.kindlingDate), weaningDays) },
    doeState: { type: "string", value: (r) => r.doeState },
    alive: { type: "number", value: (r) => r.bornAlive },
    dead: { type: "number", value: (r) => r.bornDead },
  });

  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{locale === "ar" ? "عمليات الفطام" : "Weaning Operations"}</h1>
          <p className="text-sm text-muted-foreground">
            {locale === "ar"
              ? `بطون ولدت وجاهزة للفطام بعد مرور ${weaningDays} يومًا (${litters.length} بطون)`
              : `Litters ready for weaning after ${weaningDays} days (${litters.length} litters)`}
          </p>
        </div>
      )}

      <div className="space-y-3">
      <h2 className="text-lg font-bold">
        {locale === "ar" ? "أرانب محتاجة تتفطم" : "Rabbits due for weaning"}
      </h2>
      {litters.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
          <Milk className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">{locale === "ar" ? "لا توجد بطون للفطام حاليًا" : "No litters for weaning"}</p>
          <p className="text-sm">
            {locale === "ar"
              ? "كل الولادات المسجلة لم تبلغ سن الفطام المحدد بالإعدادات بعد."
              : "All registered litters are below the weaning age threshold."}
          </p>
        </div>
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
                  activeSortKey={littersSort.sortKey}
                  direction={littersSort.direction}
                  onSort={littersSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "النوع" : "Breed"}
                  sortKey="breed"
                  activeSortKey={littersSort.sortKey}
                  direction={littersSort.direction}
                  onSort={littersSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "رقم الذكر" : "Buck ID"}
                  sortKey="buckTag"
                  activeSortKey={littersSort.sortKey}
                  direction={littersSort.direction}
                  onSort={littersSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={locale === "ar" ? "تاريخ الولادة" : "Kindling Date"}
                  sortKey="kindlingDate"
                  activeSortKey={littersSort.sortKey}
                  direction={littersSort.direction}
                  onSort={littersSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "تاريخ الفطام المتوقع" : "Expected Weaning"}
                  sortKey="dueDate"
                  activeSortKey={littersSort.sortKey}
                  direction={littersSort.direction}
                  onSort={littersSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "حالة الأم" : "Doe State"}
                  sortKey="doeState"
                  activeSortKey={littersSort.sortKey}
                  direction={littersSort.direction}
                  onSort={littersSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={locale === "ar" ? "أحياء" : "Alive"}
                  sortKey="alive"
                  activeSortKey={littersSort.sortKey}
                  direction={littersSort.direction}
                  onSort={littersSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={locale === "ar" ? "نافق" : "Dead"}
                  sortKey="dead"
                  activeSortKey={littersSort.sortKey}
                  direction={littersSort.direction}
                  onSort={littersSort.toggleSort}
                />
                <th className="px-2 py-2 md:px-4 md:py-3 text-center">{locale === "ar" ? "الفطام" : "Wean"}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {littersSort.sorted.map((row, index) => {
                const dueDate = weaningDueDate(new Date(row.kindlingDate), weaningDays);

                return (
                  <tr key={row.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-2 py-2 md:px-4 md:py-3.5 text-center text-muted-foreground font-medium">{index + 1}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 font-bold">{row.doeTagId ?? "—"}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 hidden md:table-cell">{row.doeBreed ?? "—"}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 hidden md:table-cell font-bold">{row.buckTagId ?? "—"}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5">
                      <LocalDate date={row.kindlingDate} />
                    </td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 hidden md:table-cell">
                      <LocalDate date={dueDate} />
                    </td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 hidden md:table-cell">
                      <DoeStateBadge current={row.doeState} locale={locale} />
                    </td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 text-center">{row.bornAlive}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5 text-center">{row.bornDead}</td>
                    <td className="px-2 py-2 md:px-4 md:py-3.5">
                      <WeanButton
                        breedingId={row.breedingId}
                        doeId={row.doeId}
                        text={t.weaning.weanButton}
                        active
                        weaned={false}
                        locale={locale}
                        onDone={() => void load()}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>

      <div className="pt-4 border-t">
        <WeaningLog weanedLog={weanedLog} locale={locale} onDone={() => void load()} todayOnly />
      </div>
    </div>
  );
}
