import { useEffect, useState, useCallback } from "react";
import { Microscope } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchPregnancyPageData, type PregnancyTestLogEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { DoeStateBadge, DoeActionButton, MatingFailedButton } from "../components/doe-state-menu";
import { pregnancyTestDate, isToday } from "@/lib/dates";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";
import { PregnancyTestLog } from "./pregnancy-test-log";

export function PregnancyTestPage({ locale, hideHeader }: { locale: Locale; hideHeader?: boolean }) {
  const t = getClientDictionary(locale);
  const [data, setData] = useState<{
    candidates: { id: string; tagId: string | null; breed: string | null; doeState: string; matingDate: string | null; buckTagId: string | null; breedingId: string }[];
    testLog: PregnancyTestLogEntry[];
    pregnancyTestDays: number;
  } | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchPregnancyPageData(db);
    setData({
      candidates: res.candidates,
      testLog: res.testLog,
      pregnancyTestDays: res.settings.pregnancyTestDays,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const candidates = data?.candidates ?? [];
  const testLog = (data?.testLog ?? []).filter((entry) => isToday(entry.testDate));
  const pregnancyTestDays = data?.pregnancyTestDays ?? 0;

  const candidatesSort = useSortableRows(candidates, {
    doeTag: { type: "tag", value: (r) => r.tagId },
    breed: { type: "string", value: (r) => r.breed },
    buckTag: { type: "tag", value: (r) => r.buckTagId },
    matingDate: { type: "date", value: (r) => r.matingDate },
    expectedTest: {
      type: "date",
      value: (r) => (r.matingDate ? pregnancyTestDate(new Date(r.matingDate), pregnancyTestDays) : null),
    },
    doeState: { type: "string", value: (r) => r.doeState },
  });

  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{t.pregnancyTest.title}</h1>
          <p className="text-sm text-muted-foreground">
            {locale === "ar"
              ? `أمهات حان موعد جسها بعد مرور ${pregnancyTestDays} أيام من التلقيح (${candidates.length} أمهات)`
              : `Does ready for testing after ${pregnancyTestDays} days (${candidates.length} does)`}
          </p>
        </div>
      )}

      <div className="space-y-3">
      <h2 className="text-lg font-bold">
        {locale === "ar" ? "أمهات مستعدة للجس" : "Does ready for pregnancy test"}
      </h2>
      {candidates.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
          <Microscope className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">{t.pregnancyTest.emptyTitle}</p>
          <p className="text-sm">{t.pregnancyTest.emptyDescription}</p>
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
                  sortKey="doeTag"
                  activeSortKey={candidatesSort.sortKey}
                  direction={candidatesSort.direction}
                  onSort={candidatesSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "النوع" : "Breed"}
                  sortKey="breed"
                  activeSortKey={candidatesSort.sortKey}
                  direction={candidatesSort.direction}
                  onSort={candidatesSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "رقم الذكر" : "Buck ID"}
                  sortKey="buckTag"
                  activeSortKey={candidatesSort.sortKey}
                  direction={candidatesSort.direction}
                  onSort={candidatesSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "تاريخ التلقيح" : "Mating Date"}
                  sortKey="matingDate"
                  activeSortKey={candidatesSort.sortKey}
                  direction={candidatesSort.direction}
                  onSort={candidatesSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "تاريخ الجس المتوقع" : "Expected Test Date"}
                  sortKey="expectedTest"
                  activeSortKey={candidatesSort.sortKey}
                  direction={candidatesSort.direction}
                  onSort={candidatesSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "حالة الأم" : "Doe State"}
                  sortKey="doeState"
                  activeSortKey={candidatesSort.sortKey}
                  direction={candidatesSort.direction}
                  onSort={candidatesSort.toggleSort}
                />
                <th className="px-4 py-3 text-center">{locale === "ar" ? "نتيجة الجس" : "Test Result"}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {candidatesSort.sorted.map((row, index) => {
                const expectedTest = row.matingDate
                  ? pregnancyTestDate(new Date(row.matingDate), data.pregnancyTestDays)
                  : null;

                return (
                  <tr key={row.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3.5 text-center text-muted-foreground font-medium">{index + 1}</td>
                    <td className="px-4 py-3.5 font-bold">{row.tagId ?? "—"}</td>
                    <td className="px-4 py-3.5 hidden md:table-cell">{row.breed ?? "—"}</td>
                    <td className="px-4 py-3.5 hidden md:table-cell font-bold">{row.buckTagId ?? "—"}</td>
                    <td className="px-4 py-3.5">
                      {row.matingDate ? <LocalDate date={row.matingDate} /> : "—"}
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      {expectedTest ? <LocalDate date={expectedTest} /> : "—"}
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <DoeStateBadge current={row.doeState} locale={locale} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <DoeActionButton
                          id={row.id}
                          breedingId={row.breedingId}
                          text={t.pregnancyTest.pregnantButton}
                          target={row.doeState === "nursing_bred" ? "nursing_pregnant" : "pregnant"}
                          className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                          locale={locale}
                          onDone={() => void load()}
                        />
                        <MatingFailedButton
                          breedingId={row.breedingId}
                          doeId={row.id}
                          text={t.pregnancyTest.negativeButton}
                          className="border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                          locale={locale}
                          onDone={() => void load()}
                        />
                      </div>
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
        <PregnancyTestLog testLog={testLog} locale={locale} todayOnly />
      </div>
    </div>
  );
}
