import { useEffect, useState, useCallback } from "react";
import { Milk } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchWeaningPageData, type WeaningLitterRow, type WeanedLitterLogEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { DoeStateBadge, WeanButton, LitterCountInput, LitterWeightInput } from "../components/doe-state-menu";
import { weaningDueDate } from "@/lib/dates";

function survivalRate(bornAlive: number, weaned: number | null): number | null {
  if (bornAlive <= 0 || weaned === null) return null;
  return weaned / bornAlive;
}

export function WeaningPage({ locale }: { locale: Locale }) {
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

  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  const { litters, weanedLog, weaningDays } = data;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{locale === "ar" ? "عمليات الفطام" : "Weaning Operations"}</h1>
        <p className="text-sm text-muted-foreground">
          {locale === "ar"
            ? `بطون ولدت وجاهزة للفطام بعد مرور ${weaningDays} يومًا (${litters.length} بطون)`
            : `Litters ready for weaning after ${weaningDays} days (${litters.length} litters)`}
        </p>
      </div>

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
              <tr>
                <th className="px-4 py-3 w-12 text-center">{locale === "ar" ? "م" : "No."}</th>
                <th className="px-4 py-3">{locale === "ar" ? "رقم الأم" : "Doe ID"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "النوع" : "Breed"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "رقم الذكر" : "Buck ID"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "تاريخ الولادة" : "Kindling Date"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "تاريخ الفطام المتوقع" : "Expected Weaning"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "حالة الأم" : "Doe State"}</th>
                <th className="px-4 py-3 text-center">{locale === "ar" ? "أحياء" : "Alive"}</th>
                <th className="px-4 py-3 text-center">{locale === "ar" ? "نافق" : "Dead"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "الفطام" : "Wean"}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {litters.map((row, index) => {
                const dueDate = weaningDueDate(row.kindlingDate, weaningDays);

                return (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3.5 text-center text-muted-foreground font-medium">{index + 1}</td>
                    <td className="px-4 py-3.5 font-bold">{row.doeTagId ?? "—"}</td>
                    <td className="px-4 py-3.5">{row.doeBreed ?? "—"}</td>
                    <td className="px-4 py-3.5 font-bold">{row.buckTagId ?? "—"}</td>
                    <td className="px-4 py-3.5">
                      <LocalDate date={row.kindlingDate} />
                    </td>
                    <td className="px-4 py-3.5">
                      <LocalDate date={dueDate} />
                    </td>
                    <td className="px-4 py-3.5">
                      <DoeStateBadge current={row.doeState} locale={locale} />
                    </td>
                    <td className="px-4 py-3.5 text-center">{row.bornAlive}</td>
                    <td className="px-4 py-3.5 text-center">{row.bornDead}</td>
                    <td className="px-4 py-3.5">
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

      <div className="space-y-3 pt-4 border-t">
        <h2 className="text-lg font-bold">{locale === "ar" ? "سجل الفطام" : "Weaning Log"}</h2>
        {weanedLog.length === 0 ? (
          <p className="text-sm text-muted-foreground">{locale === "ar" ? "لا توجد سجلات فطام بعد." : "No weaning logs yet."}</p>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 w-12 text-center">{locale === "ar" ? "م" : "No."}</th>
                  <th className="px-4 py-3">{locale === "ar" ? "رقم الأم" : "Doe ID"}</th>
                  <th className="px-4 py-3">{locale === "ar" ? "النوع" : "Breed"}</th>
                  <th className="px-4 py-3">{locale === "ar" ? "رقم الذكر" : "Buck ID"}</th>
                  <th className="px-4 py-3">{locale === "ar" ? "تاريخ الولادة" : "Kindling Date"}</th>
                  <th className="px-4 py-3">{locale === "ar" ? "تاريخ الفطام" : "Weaning Date"}</th>
                  <th className="px-4 py-3 text-center">{locale === "ar" ? "أحياء" : "Alive"}</th>
                  <th className="px-4 py-3 text-center">{locale === "ar" ? "نافق" : "Dead"}</th>
                  <th className="px-4 py-3 text-center">{locale === "ar" ? "عدد المفطومين" : "Weaned Count"}</th>
                  <th className="px-4 py-3 text-center">{locale === "ar" ? "وزن الفطام (جم)" : "Weaning Weight (g)"}</th>
                  <th className="px-4 py-3 text-center">{locale === "ar" ? "نسبة النجاح" : "Survival Rate"}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {weanedLog.map((log, index) => {
                  const rate = survivalRate(log.bornAlive, log.weaned);

                  return (
                    <tr key={log.breedingId} className="hover:bg-muted/40">
                      <td className="px-4 py-3.5 text-center text-muted-foreground font-medium">{index + 1}</td>
                      <td className="px-4 py-3.5 font-bold">{log.doeTagId ?? "—"}</td>
                      <td className="px-4 py-3.5">{log.doeBreed ?? "—"}</td>
                      <td className="px-4 py-3.5 font-bold">{log.buckTagId ?? "—"}</td>
                      <td className="px-4 py-3.5">
                        <LocalDate date={log.kindlingDate} />
                      </td>
                      <td className="px-4 py-3.5">
                        <LocalDate date={log.weaningDate} />
                      </td>
                      <td className="px-4 py-3.5 text-center">{log.bornAlive}</td>
                      <td className="px-4 py-3.5 text-center">{log.bornDead || "—"}</td>
                      <td className="px-4 py-3.5 text-center">
                        <LitterCountInput
                          breedingId={log.breedingId}
                          field="weaned"
                          value={log.weaned}
                          locale={locale}
                          className="w-12 mx-auto"
                          onDone={() => void load()}
                        />
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <LitterWeightInput
                          breedingId={log.breedingId}
                          valueGrams={log.weaningWeightGrams}
                          locale={locale}
                          className="w-16 mx-auto"
                          onDone={() => void load()}
                        />
                      </td>
                      <td className="px-4 py-3.5 text-center font-semibold">
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
    </div>
  );
}
