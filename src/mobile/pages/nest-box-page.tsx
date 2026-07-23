import { useEffect, useState, useCallback } from "react";
import { Box } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { fetchNestBoxPageData, type LocalNestBoxCandidate, type LocalInstalledNestBoxLogEntry } from "../db/queries";
import { isToday } from "@/lib/dates";
import { LocalDate } from "@/components/local-date";
import { DoeStateBadge, InstallNestBoxButton } from "../components/doe-state-menu";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";

export function NestBoxPage({ locale, hideHeader }: { locale: Locale; hideHeader?: boolean }) {
  const t = getClientDictionary(locale);
  const [data, setData] = useState<{
    does: LocalNestBoxCandidate[];
    installedLog: LocalInstalledNestBoxLogEntry[];
    nestBoxDays: number;
  } | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const res = await fetchNestBoxPageData(db);
    setData({
      does: res.does,
      installedLog: res.installedLog,
      nestBoxDays: res.settings.nestBoxDays,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const does = data?.does ?? [];
  const installedLog = (data?.installedLog ?? []).filter((entry) => isToday(entry.nestBoxDate));
  const nestBoxDays = data?.nestBoxDays ?? 0;

  const doesSort = useSortableRows(does, {
    tag: { type: "tag", value: (r) => r.tagId },
    breed: { type: "string", value: (r) => r.breed },
    buckTag: { type: "tag", value: (r) => r.buckTagId },
    matingDate: { type: "date", value: (r) => r.matingDate },
    installDate: { type: "date", value: (r) => r.expectedInstallDate },
    kindlingDate: { type: "date", value: (r) => r.expectedKindlingDate },
    doeState: { type: "string", value: (r) => r.doeState },
  });
  const logSort = useSortableRows(installedLog, {
    tag: { type: "tag", value: (r) => r.doeTagId },
    breed: { type: "string", value: (r) => r.doeBreed },
    buckTag: { type: "tag", value: (r) => r.buckTagId },
    matingDate: { type: "date", value: (r) => r.matingDate },
    installDate: { type: "date", value: (r) => r.nestBoxDate },
    doeState: { type: "string", value: (r) => r.doeState },
  });

  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{locale === "ar" ? "تركيب بيوت الولادة" : "Nest Box Installation"}</h1>
          <p className="text-sm text-muted-foreground">
            {locale === "ar"
              ? `أمهات بحاجة لتركيب بيت الولادة بعد مرور ${nestBoxDays} أيام من التلقيح (${does.length} أمهات)`
              : `Does requiring nest box installation after ${nestBoxDays} days (${does.length} does)`}
          </p>
        </div>
      )}

      {does.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
          <Box className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">{locale === "ar" ? "كل بيوت الولادة مركبة" : "All nest boxes installed"}</p>
          <p className="text-sm">
            {locale === "ar"
              ? "لا توجد أمهات تحتاج إلى تركيب بيت الولادة حاليًا."
              : "No does currently require nest box installation."}
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
                  className="px-4 py-3 hidden md:table-cell text-center"
                  label={locale === "ar" ? "تاريخ التركيب المتوقع" : "Expected Install Date"}
                  sortKey="installDate"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <SortableTh
                  className="px-4 py-3 text-center"
                  label={locale === "ar" ? "تاريخ الولادة المتوقع" : "Expected Kindling"}
                  sortKey="kindlingDate"
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
                <th className="px-4 py-3 text-center">{locale === "ar" ? "التركيب" : "Install"}</th>
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
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    <LocalDate date={row.expectedInstallDate} />
                  </td>
                  <td className="px-4 py-3.5">
                    <LocalDate date={row.expectedKindlingDate} />
                  </td>
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    <DoeStateBadge current={row.doeState} locale={locale} />
                  </td>
                  <td className="px-4 py-3.5">
                    <InstallNestBoxButton
                      breedingId={row.breedingId}
                      doeId={row.id}
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

      {/* Log section */}
      <div className="space-y-3 pt-4 border-t">
        <h2 className="text-lg font-bold">
          {locale === "ar" ? "سجل تركيب بيوت الولادة" : "Nest Box Installation Log"}
          {locale === "ar" ? " النهاردة" : " (Today)"}
        </h2>
        {installedLog.length === 0 ? (
          <p className="text-sm text-muted-foreground">{locale === "ar" ? "لا توجد سجلات تركيب بعد." : "No installation logs yet."}</p>
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
                    className="px-4 py-3 text-center"
                    label={locale === "ar" ? "النوع" : "Breed"}
                    sortKey="breed"
                    activeSortKey={logSort.sortKey}
                    direction={logSort.direction}
                    onSort={logSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 hidden md:table-cell text-center"
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
                    label={locale === "ar" ? "تاريخ التركيب" : "Install Date"}
                    sortKey="installDate"
                    activeSortKey={logSort.sortKey}
                    direction={logSort.direction}
                    onSort={logSort.toggleSort}
                  />
                  <SortableTh
                    className="px-4 py-3 hidden md:table-cell text-center"
                    label={locale === "ar" ? "حالة الأم" : "Doe State"}
                    sortKey="doeState"
                    activeSortKey={logSort.sortKey}
                    direction={logSort.direction}
                    onSort={logSort.toggleSort}
                  />
                </tr>
              </thead>
              <tbody className="divide-y">
                {logSort.sorted.map((row, index) => (
                  <tr key={row.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3.5 text-center text-muted-foreground font-medium">{index + 1}</td>
                    <td className="px-4 py-3.5 font-bold">{row.doeTagId ?? "—"}</td>
                    <td className="px-4 py-3.5">{row.doeBreed ?? "—"}</td>
                    <td className="px-4 py-3.5 hidden md:table-cell font-bold">{row.buckTagId ?? "—"}</td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      {row.matingDate ? <LocalDate date={row.matingDate} /> : "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <LocalDate date={row.nestBoxDate} />
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <DoeStateBadge current={row.doeState} locale={locale} />
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
