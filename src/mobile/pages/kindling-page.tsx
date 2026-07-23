import { useEffect, useState, useCallback } from "react";
import { HeartPulse } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchKindlingPageData, type KindlingLogEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { DoeStateBadge, KindleButton } from "../components/doe-state-menu";
import type { DoeState } from "@/lib/enums";
import { isToday } from "@/lib/dates";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";
import { KindlingLog } from "./kindling-log";

export function KindlingPage({ locale, hideHeader }: { locale: Locale; hideHeader?: boolean }) {
  const t = getClientDictionary(locale);
  const [data, setData] = useState<{
    does: { id: string; tagId: string | null; breed: string | null; doeState: string; matingDate: string | null; expectedKindlingDate: string; buckTagId: string | null; breedingId: string }[];
    kindlingLog: KindlingLogEntry[];
    gestationDays: number;
  } | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchKindlingPageData(db);
    setData({
      does: res.does,
      kindlingLog: res.kindlingLog,
      gestationDays: res.settings.gestationDays,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const does = data?.does ?? [];
  const kindlingLog = (data?.kindlingLog ?? []).filter((entry) => isToday(entry.kindlingDate));
  const gestationDays = data?.gestationDays;

  const doesSort = useSortableRows(does, {
    tag: { type: "tag", value: (r) => r.tagId },
    breed: { type: "string", value: (r) => r.breed },
    buckTag: { type: "tag", value: (r) => r.buckTagId },
    matingDate: { type: "date", value: (r) => r.matingDate },
    expectedDate: { type: "date", value: (r) => r.expectedKindlingDate },
    doeState: { type: "string", value: (r) => r.doeState },
  });
  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{locale === "ar" ? "عمليات الولادة" : "Kindling Operations"}</h1>
          <p className="text-sm text-muted-foreground">
            {locale === "ar"
              ? `أمهات عشار مستحقة الولادة حاليًا (${does.length} أمهات)`
              : `Pregnant does expected to kindle soon (${does.length} does)`}
          </p>
        </div>
      )}

      <div className="space-y-3">
      <h2 className="text-lg font-bold">
        {locale === "ar" ? "أمهات على وش ولادة" : "Does due to kindle"}
      </h2>
      {does.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
          <HeartPulse className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">{locale === "ar" ? "لا توجد ولادات متوقعة حاليًا" : "No expected kindlings"}</p>
          <p className="text-sm">
            {locale === "ar"
              ? "جميع الأمهات الملقحة بعيدة عن تاريخ الولادة المتوقع."
              : "All bred/pregnant does are away from their expected kindling dates."}
          </p>
        </div>
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
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "النوع" : "Breed"}
                  sortKey="breed"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "رقم الذكر" : "Buck ID"}
                  sortKey="buckTag"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "تاريخ التلقيح" : "Mating Date"}
                  sortKey="matingDate"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "تاريخ الولادة المتوقع" : "Expected Kindling"}
                  sortKey="expectedDate"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "حالة الأم" : "Doe State"}
                  sortKey="doeState"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <th className="px-4 py-3 text-center">{locale === "ar" ? "الولادة" : "Kindle"}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {doesSort.sorted.map((row, index) => (
                <tr key={row.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-4 py-3.5 text-center text-muted-foreground font-medium">{index + 1}</td>
                  <td className="px-4 py-3.5 font-bold">{row.tagId ?? "—"}</td>
                  <td className="px-4 py-3.5 hidden md:table-cell">{row.breed ?? "—"}</td>
                  <td className="px-4 py-3.5 hidden md:table-cell font-bold">{row.buckTagId ?? "—"}</td>
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    {row.matingDate ? <LocalDate date={row.matingDate} /> : "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    <LocalDate date={row.expectedKindlingDate} />
                  </td>
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    <DoeStateBadge current={row.doeState} locale={locale} />
                  </td>
                  <td className="px-4 py-3.5">
                    <KindleButton
                      breedingId={row.breedingId}
                      doeId={row.id}
                      text={t.kindling.kindleButton}
                      doeState={row.doeState as DoeState}
                      locale={locale}
                      onDone={() => void load()}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>

      <div className="pt-4 border-t">
        <KindlingLog kindlingLog={kindlingLog} locale={locale} onDone={() => void load()} todayOnly />
      </div>
    </div>
  );
}
