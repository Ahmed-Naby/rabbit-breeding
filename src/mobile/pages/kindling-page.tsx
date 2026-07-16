import { useEffect, useState, useCallback } from "react";
import { HeartPulse } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchKindlingPageData, type KindlingLogEntry } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { DoeStateBadge, KindleButton, LitterCountInput } from "../components/doe-state-menu";
import type { DoeState } from "@/lib/enums";

export function KindlingPage({ locale }: { locale: Locale }) {
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

  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  const { does, kindlingLog, gestationDays } = data;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{locale === "ar" ? "عمليات الولادة" : "Kindling Operations"}</h1>
        <p className="text-sm text-muted-foreground">
          {locale === "ar"
            ? `أمهات عشار مستحقة الولادة حاليًا (${does.length} أمهات)`
            : `Pregnant does expected to kindle soon (${does.length} does)`}
        </p>
      </div>

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
                <th className="px-4 py-3 text-center">{locale === "ar" ? "رقم الأم" : "Doe ID"}</th>
                <th className="px-4 py-3 hidden md:table-cell text-center">{locale === "ar" ? "النوع" : "Breed"}</th>
                <th className="px-4 py-3 hidden md:table-cell text-center">{locale === "ar" ? "رقم الذكر" : "Buck ID"}</th>
                <th className="px-4 py-3 hidden md:table-cell text-center">{locale === "ar" ? "تاريخ التلقيح" : "Mating Date"}</th>
                <th className="px-4 py-3 text-center">{locale === "ar" ? "تاريخ الولادة المتوقع" : "Expected Kindling"}</th>
                <th className="px-4 py-3 hidden md:table-cell text-center">{locale === "ar" ? "حالة الأم" : "Doe State"}</th>
                <th className="px-4 py-3 text-center">{locale === "ar" ? "الولادة" : "Kindle"}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {does.map((row, index) => (
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

      <div className="space-y-3 pt-4 border-t">
        <h2 className="text-lg font-bold">{locale === "ar" ? "سجل الولادة" : "Kindling Log"}</h2>
        {kindlingLog.length === 0 ? (
          <p className="text-sm text-muted-foreground">{locale === "ar" ? "لا توجد سجلات ولادة بعد." : "No kindling logs yet."}</p>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
             <table className="w-full text-sm text-left rtl:text-right">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr className="[&>th]:border-x">
                  <th className="px-4 py-3 w-12 text-center">{locale === "ar" ? "م" : "No."}</th>
                  <th className="px-4 py-3 text-center">{locale === "ar" ? "رقم الأم" : "Doe ID"}</th>
                  <th className="px-4 py-3 hidden md:table-cell text-center">{locale === "ar" ? "النوع" : "Breed"}</th>
                  <th className="px-4 py-3 text-center">{locale === "ar" ? "رقم الذكر" : "Buck ID"}</th>
                  <th className="px-4 py-3 hidden md:table-cell text-center">{locale === "ar" ? "تاريخ التلقيح" : "Mating Date"}</th>
                  <th className="px-4 py-3 text-center">{locale === "ar" ? "تاريخ الولادة" : "Kindling Date"}</th>
                  <th className="px-4 py-3 text-center">{locale === "ar" ? "أحياء" : "Born Alive"}</th>
                  <th className="px-4 py-3 text-center">{locale === "ar" ? "نافق" : "Born Dead"}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {kindlingLog.map((log, index) => (
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
                        onDone={() => void load()}
                        className="h-6 w-10 md:h-8 md:w-16"
                      />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <LitterCountInput
                        breedingId={log.breedingId}
                        field="bornDead"
                        value={log.bornDead}
                        locale={locale}
                        onDone={() => void load()}
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
    </div>
  );
}
