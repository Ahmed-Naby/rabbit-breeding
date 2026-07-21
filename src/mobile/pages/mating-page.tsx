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
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";

export function MatingPage({ locale, hideHeader }: { locale: Locale; hideHeader?: boolean }) {
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

  const does = data?.does ?? [];
  const matingLog = data?.matingLog ?? [];
  const settings = data?.settings;

  const doesSort = useSortableRows(does, {
    tag: { type: "tag", value: (r) => r.tagId },
    breed: { type: "string", value: (r) => r.breed },
    doeState: { type: "string", value: (r) => r.doeState },
  });
  const matingLogSort = useSortableRows(matingLog, {
    tag: { type: "tag", value: (r) => r.doeTagId },
    breed: { type: "string", value: (r) => r.doeBreed },
    buckTag: { type: "tag", value: (r) => r.buckTagId },
    matingDate: { type: "date", value: (r) => r.matingDate },
    doeState: { type: "string", value: (r) => r.doeState },
  });

  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{t.mating.title}</h1>
          <p className="text-sm text-muted-foreground">
            {locale === "ar"
              ? `${does.length} أم جاهزة للتلقيح الآن`
              : `${does.length} does ready for mating now`}
          </p>
        </div>
      )}

      <div className="space-y-3">
      <h2 className="text-lg font-bold">
        {locale === "ar" ? "أمهات جاهزة للتلقيح" : "Does ready for mating"}
      </h2>
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
                <SortableTh
                  label={locale === "ar" ? "رقم الأم" : "Doe ID"}
                  sortKey="tag"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                  className="px-4 py-3"
                />
                <SortableTh
                  label={locale === "ar" ? "النوع" : "Breed"}
                  sortKey="breed"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                  className="px-4 py-3 hidden md:table-cell"
                />
                <SortableTh
                  label={locale === "ar" ? "حالة الأم" : "Doe State"}
                  sortKey="doeState"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                  className="px-4 py-3"
                />
                <th className="px-4 py-3">{locale === "ar" ? "التلقيح" : "Mating"}</th>
              </tr>
            </thead>
            <tbody>
              {doesSort.sorted.map((doe, index) => {
                const { current, canMate } = computeDoeBoardRow(doe.doeState as DoeState, doe.status, doe.breedings, settings!);
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
      </div>

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
                  <SortableTh
                    label={locale === "ar" ? "رقم الأم" : "Doe ID"}
                    sortKey="tag"
                    activeSortKey={matingLogSort.sortKey}
                    direction={matingLogSort.direction}
                    onSort={matingLogSort.toggleSort}
                    className="px-4 py-3"
                  />
                  <SortableTh
                    label={locale === "ar" ? "النوع" : "Breed"}
                    sortKey="breed"
                    activeSortKey={matingLogSort.sortKey}
                    direction={matingLogSort.direction}
                    onSort={matingLogSort.toggleSort}
                    className="px-4 py-3 hidden md:table-cell"
                  />
                  <SortableTh
                    label={locale === "ar" ? "رقم الذكر" : "Buck ID"}
                    sortKey="buckTag"
                    activeSortKey={matingLogSort.sortKey}
                    direction={matingLogSort.direction}
                    onSort={matingLogSort.toggleSort}
                    className="px-4 py-3"
                  />
                  <SortableTh
                    label={locale === "ar" ? "تاريخ التلقيح" : "Mating Date"}
                    sortKey="matingDate"
                    activeSortKey={matingLogSort.sortKey}
                    direction={matingLogSort.direction}
                    onSort={matingLogSort.toggleSort}
                    className="px-4 py-3"
                  />
                  <SortableTh
                    label={locale === "ar" ? "حالة الأم" : "Doe State"}
                    sortKey="doeState"
                    activeSortKey={matingLogSort.sortKey}
                    direction={matingLogSort.direction}
                    onSort={matingLogSort.toggleSort}
                    className="px-4 py-3"
                  />
                </tr>
              </thead>
              <tbody>
                {matingLogSort.sorted.map((log, index) => (
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
