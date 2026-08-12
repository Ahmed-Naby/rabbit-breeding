import { useEffect, useState, useCallback } from "react";
import {
  HeartPulse,
  HeartHandshake,
  Baby,
  Layers,
  Rabbit as RabbitIcon,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { useDbRefresh } from "../lib/use-db-refresh";
import { queryAll, queryOne } from "../db/helpers";
import { StatusBadge } from "@/components/status-badge";
import { RabbitTagBadge } from "@/components/rabbit-tag-badge";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/skeleton";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ExportXlsxButton } from "@/components/export-xlsx-button";
import { saveBinaryFile } from "../lib/save-file";

type FertilityRow = {
  id: string;
  tagId: string;
  breed: string | null;
  status: string;
  totalBreedings: number;
  totalPregnancies: number;
  fertilityRate: number | null;
  avgBorn: number | null;
  totalBornAtKindling: number;
};

export function BucksFertilityPage({ locale, hideHeader }: { locale: Locale; hideHeader?: boolean }) {
  const t = getClientDictionary(locale).bucksFertility;
  const [data, setData] = useState<{
    rows: FertilityRow[];
    overallFertility: number;
    overallPregnancies: number;
    overallBreedings: number;
    overallBornAtKindling: number;
    overallAvgBorn: number;
  } | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    
    // Fetch all active bucks in the herd
    const bucks = await queryAll<{
      id: string;
      tagId: string;
      breed: string | null;
      status: string;
    }>(
      db,
      "SELECT id, tagId, breed, status FROM rabbit WHERE sex = 'buck' AND tagId IS NOT NULL AND status NOT IN ('deceased', 'culled') ORDER BY tagId ASC"
    );

    const rows: FertilityRow[] = [];
    let overallBreedings = 0;
    let overallPregnancies = 0;
    let overallKindlings = 0;
    let overallBornAtKindling = 0;

    for (const buck of bucks) {
      // Lifetime counts come from the append-only archive logs, NOT the live
      // breeding row: it's nulled and reused on the doe's next cycle (see
      // breeding-ops markKindled), so counting off it drops every past mating
      // the moment she kindles. These logs only reset when an operations/data
      // reset clears them.
      const matingRow = await queryOne<{ c: number }>(
        db,
        "SELECT COUNT(*) AS c FROM mating_log WHERE buckId = ?",
        [buck.id]
      );
      // A buck's rate is settling rate, so the numerator is confirmed
      // pregnancies, not kindlings — losing a confirmed pregnancy afterwards is
      // the doe's outcome, not his. DISTINCT doe+day because two positives can
      // exist for one mating (the palpation and the تأكيد الجس re-check) and
      // their matingDate timestamps can drift by a fraction; the same key that
      // fetchBuckBreedingHistory stitches cycles on, so the two never disagree.
      const pregnancyRow = await queryOne<{ c: number }>(
        db,
        "SELECT COUNT(DISTINCT doeId || '_' || substr(matingDate, 1, 10)) AS c FROM pregnancy_test_log WHERE buckId = ? AND result = 'positive'",
        [buck.id]
      );
      // bornAliveAtKindling, not bornAlive: a buck's litter size is what he
      // sired, and fostering kits away from the doe afterwards doesn't change
      // that. Using the nursing count here would also disagree with the same
      // figure on his own page (rabbit-detail-page).
      const kindlingRow = await queryOne<{ c: number; born: number }>(
        db,
        "SELECT COUNT(*) AS c, COALESCE(SUM(bornAliveAtKindling), 0) AS born FROM kindling_log WHERE buckId = ?",
        [buck.id]
      );
      const totalBreedings = matingRow?.c ?? 0;
      const totalPregnancies = pregnancyRow?.c ?? 0;
      const totalKindlings = kindlingRow?.c ?? 0;
      const totalBornAtKindling = kindlingRow?.born ?? 0;

      // Confirmed pregnancies ÷ matings. A buck's only job is settling the doe;
      // whether she then carries the litter to term is her outcome, so
      // kindlings stay out of the rate (they still drive avgBorn below). Same
      // definition as computeBuckFertilityStats on his own page.
      const fertilityRate = totalBreedings > 0 ? (totalPregnancies / totalBreedings) * 100 : null;
      const avgBorn = totalKindlings > 0 ? totalBornAtKindling / totalKindlings : null;

      // Add to aggregate counts
      overallBreedings += totalBreedings;
      overallPregnancies += totalPregnancies;
      overallKindlings += totalKindlings;
      overallBornAtKindling += totalBornAtKindling;

      rows.push({
        id: buck.id,
        tagId: buck.tagId,
        breed: buck.breed,
        status: buck.status,
        totalBreedings,
        totalPregnancies,
        fertilityRate,
        avgBorn,
        totalBornAtKindling,
      });
    }

    const overallFertility = overallBreedings > 0 ? Math.round((overallPregnancies / overallBreedings) * 100) : 0;
    const overallAvgBorn = overallKindlings > 0 ? Number((overallBornAtKindling / overallKindlings).toFixed(1)) : 0;

    setData({
      rows,
      overallFertility,
      overallPregnancies,
      overallBreedings,
      overallBornAtKindling,
      overallAvgBorn,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useDbRefresh(load);

  const listRows = data?.rows ?? [];
  const bucksSort = useSortableRows(listRows, {
    buckTag: { type: "tag", value: (r) => r.tagId },
    breed: { type: "string", value: (r) => r.breed },
    status: { type: "string", value: (r) => r.status },
    breedings: { type: "number", value: (r) => r.totalBreedings },
    pregnancies: { type: "number", value: (r) => r.totalPregnancies },
    fertilityRate: { type: "number", value: (r) => r.fertilityRate ?? -1 },
    avgBorn: { type: "number", value: (r) => r.avgBorn ?? -1 },
    totalBorn: { type: "number", value: (r) => r.totalBornAtKindling },
  }, { key: "buckTag" });

  if (!data) {
    return <PageSkeleton label={locale === "ar" ? "جارِ التحميل…" : "Loading…"} />;
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Page Header */}
      {!hideHeader && (
        <PageHeader
          title={t.title}
          description={t.description(listRows.length)}
        />
      )}

      {listRows.length > 0 && (
        <div className="rounded-xl border bg-card text-card-foreground shadow-xs">
          <div className="px-6 py-4 border-b">
            <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight">
              {t.statsHeading}
              {/* Bare figure, no label — same as تقرير خصوبة الأمهات. */}
              <span className="rounded-full bg-primary/10 px-3 py-0.5 text-lg font-bold tabular-nums text-primary">
                {data.overallFertility}%
              </span>
              {/* saveBinaryFile: on Android a Blob download silently does nothing. */}
              <ExportXlsxButton
                className="ms-auto"
                locale={locale}
                save={saveBinaryFile}
                spec={{ kind: "bucksFertility", rows: listRows }}
              />
            </h3>
          </div>
          <div className="p-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {/* تلقيحات ← عشار، زي صفحة الويب. معدل الخصوبة بقى بادج. */}
              <StatCard
                icon={HeartHandshake}
                label={t.statTotalBreedings}
                value={data.overallBreedings.toString()}
                className="border-violet-500/20 bg-violet-500/5 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400"
              />
              <StatCard
                icon={HeartPulse}
                label={t.statPregnancies}
                value={data.overallPregnancies.toString()}
                className="border-fuchsia-500/20 bg-fuchsia-500/5 dark:bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400"
              />
              <StatCard
                icon={Layers}
                label={t.statTotalBorn}
                value={data.overallBornAtKindling.toString()}
                className="border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400"
              />
              <StatCard
                icon={Baby}
                label={t.statAvgBorn}
                value={data.overallAvgBorn.toFixed(1)}
                className="border-sky-500/20 bg-sky-500/5 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400"
              />
            </div>
          </div>
        </div>
      )}

      {listRows.length === 0 ? (
        <EmptyState icon={RabbitIcon} title={t.emptyTitle} description={t.emptyDescription} />
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto shadow-xs">
          <table className="w-full text-sm text-left rtl:text-right border-collapse">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr className="[&>th]:border-x">
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colBuckTag}
                  sortKey="buckTag"
                  activeSortKey={bucksSort.sortKey}
                  direction={bucksSort.direction}
                  onSort={bucksSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colBreed}
                  sortKey="breed"
                  activeSortKey={bucksSort.sortKey}
                  direction={bucksSort.direction}
                  onSort={bucksSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colStatus}
                  sortKey="status"
                  activeSortKey={bucksSort.sortKey}
                  direction={bucksSort.direction}
                  onSort={bucksSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colBreedings}
                  sortKey="breedings"
                  activeSortKey={bucksSort.sortKey}
                  direction={bucksSort.direction}
                  onSort={bucksSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colPregnancies}
                  sortKey="pregnancies"
                  activeSortKey={bucksSort.sortKey}
                  direction={bucksSort.direction}
                  onSort={bucksSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colFertilityRate}
                  sortKey="fertilityRate"
                  activeSortKey={bucksSort.sortKey}
                  direction={bucksSort.direction}
                  onSort={bucksSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colAvgBorn}
                  sortKey="avgBorn"
                  activeSortKey={bucksSort.sortKey}
                  direction={bucksSort.direction}
                  onSort={bucksSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colTotalBorn}
                  sortKey="totalBorn"
                  activeSortKey={bucksSort.sortKey}
                  direction={bucksSort.direction}
                  onSort={bucksSort.toggleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {bucksSort.sorted.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-bold">
                    <RabbitTagBadge
                      tagId={r.tagId}
                      sex="buck"
                      onClick={() => {
                        window.location.hash = `#/rabbits/${r.id}`;
                      }}
                    />
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5">{r.breed ?? "—"}</td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5">
                    <StatusBadge value={r.status} locale={locale} />
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums">{r.totalBreedings}</td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums">{r.totalPregnancies}</td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                    {r.fertilityRate != null ? `${Math.round(r.fertilityRate)}%` : "—"}
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums text-sky-600 dark:text-sky-400">
                    {r.avgBorn != null ? r.avgBorn.toFixed(1) : "—"}
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums text-rose-600 dark:text-rose-400">
                    {r.totalBornAtKindling}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("p-4 rounded-xl flex items-center justify-between transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] shadow-xs bg-muted/40 dark:bg-white/5 border border-transparent", className)}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider opacity-85">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      </div>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl transition-all duration-300 shadow-xs bg-black/10 dark:bg-white/10">
        <Icon className="size-5" />
      </span>
    </div>
  );
}
