import { useEffect, useState, useCallback } from "react";
import { HeartHandshake } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchMatingPageData, type MatingLogEntry, type DoeRow } from "../db/queries";
import { LocalDate } from "@/components/local-date";
import { DoeStateBadge, MateCell } from "../components/doe-state-menu";
import { computeDoeBoardRow } from "@/lib/does-board";
import type { DoeState } from "@/lib/enums";
import type { LocalSettings } from "../db/types";

export function MatingPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const [data, setData] = useState<{
    does: DoeRow[];
    matingLog: MatingLogEntry[];
    settings: LocalSettings;
  } | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchMatingPageData(db);
    setData({
      does: res.does,
      matingLog: res.matingLog,
      settings: res.settings,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  const { does, matingLog, settings } = data;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{t.mating.title}</h1>
        <p className="text-sm text-muted-foreground">
          {locale === "ar"
            ? `${does.length} أم جاهزة للتلقيح الآن`
            : `${does.length} does ready for mating now`}
        </p>
      </div>

      {does.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
          <HeartHandshake className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">{t.mating.emptyTitle}</p>
          <p className="text-sm">{t.mating.emptyDescription}</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full border-collapse text-sm text-left rtl:text-right [&_td]:border [&_td]:border-border [&_th]:border [&_th]:border-border">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 w-12 text-center">{locale === "ar" ? "م" : "No."}</th>
                <th className="px-4 py-3">{locale === "ar" ? "رقم الأم" : "Doe ID"}</th>
                <th className="px-4 py-3 hidden md:table-cell">{locale === "ar" ? "النوع" : "Breed"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "حالة الأم" : "Doe State"}</th>
                <th className="px-4 py-3">{locale === "ar" ? "التلقيح" : "Mating"}</th>
              </tr>
            </thead>
            <tbody>
              {does.map((doe, index) => {
                const { current, canMate } = computeDoeBoardRow(doe.doeState as DoeState, doe.breedings, settings);
                const b = doe.breedings[0];

                return (
                  <tr key={doe.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3.5 text-center text-muted-foreground font-medium">{index + 1}</td>
                    <td className="px-4 py-3.5 font-bold">{doe.tagId ?? "—"}</td>
                    <td className="px-4 py-3.5 hidden md:table-cell">{doe.breed ?? "—"}</td>
                    <td className="px-4 py-3.5">
                      <DoeStateBadge current={doe.doeState} locale={locale} />
                    </td>
                    <td className="px-4 py-3.5">
                      <MateCell
                        breedingId={b?.id ?? null}
                        doeId={doe.id}
                        canMate={canMate}
                        buckTagId={b?.buckTagId ?? null}
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
        <h2 className="text-lg font-bold">{locale === "ar" ? "سجل التلقيح" : "Mating Log"}</h2>
        {matingLog.length === 0 ? (
          <p className="text-sm text-muted-foreground">{locale === "ar" ? "لا يوجد سجل تلقيح بعد." : "No mating log yet."}</p>
        ) : (
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full border-collapse text-sm text-left rtl:text-right [&_td]:border [&_td]:border-border [&_th]:border [&_th]:border-border">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 w-12 text-center">{locale === "ar" ? "م" : "No."}</th>
                  <th className="px-4 py-3">{locale === "ar" ? "رقم الأم" : "Doe ID"}</th>
                  <th className="px-4 py-3 hidden md:table-cell">{locale === "ar" ? "النوع" : "Breed"}</th>
                  <th className="px-4 py-3">{locale === "ar" ? "رقم الذكر" : "Buck ID"}</th>
                  <th className="px-4 py-3">{locale === "ar" ? "تاريخ التلقيح" : "Mating Date"}</th>
                  <th className="px-4 py-3">{locale === "ar" ? "حالة الأم" : "Doe State"}</th>
                </tr>
              </thead>
              <tbody>
                {matingLog.map((log, index) => (
                  <tr key={log.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3.5 text-center text-muted-foreground font-medium">{index + 1}</td>
                    <td className="px-4 py-3.5 font-bold">{log.doeTagId ?? "—"}</td>
                    <td className="px-4 py-3.5 hidden md:table-cell">{log.doeBreed ?? "—"}</td>
                    <td className="px-4 py-3.5 font-bold">{log.buckTagId ?? "—"}</td>
                    <td className="px-4 py-3.5">
                      <LocalDate date={log.matingDate} />
                    </td>
                    <td className="px-4 py-3.5">
                      <DoeStateBadge current={log.doeState} locale={locale} />
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
