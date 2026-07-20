import { useEffect, useState, useCallback } from "react";
import {
  Percent,
  HeartPulse,
  HeartHandshake,
  ShieldCheck,
  Baby,
  Layers,
  Rabbit as RabbitIcon,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { queryAll, queryOne } from "../db/helpers";
import { StatusBadge } from "@/components/status-badge";
import { DoeStateBadge } from "../components/doe-state-menu";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";
import { cn } from "@/lib/utils";

type FertilityRow = {
  id: string;
  tagId: string;
  breed: string | null;
  status: string;
  doeState: string;
  totalBreedings: number;
  totalKindlings: number;
  fertilityRate: number | null;
  avgBorn: number | null;
  avgWeaned: number | null;
  weaningSurvivalRate: number | null;
};

export function DoesFertilityPage({ locale, hideHeader }: { locale: Locale; hideHeader?: boolean }) {
  const t = getClientDictionary(locale).doesFertility;
  const [data, setData] = useState<{
    rows: FertilityRow[];
    overallFertility: number;
    overallKindlings: number;
    overallBreedings: number;
    overallSurvival: number;
    overallAvgWeaned: number;
    overallAvgBorn: number;
  } | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    
    // Fetch all active does in the herd
    const does = await queryAll<{
      id: string;
      tagId: string;
      breed: string | null;
      doeState: string;
      status: string;
    }>(
      db,
      "SELECT id, tagId, breed, doeState, status FROM rabbit WHERE sex = 'doe' AND tagId IS NOT NULL AND status NOT IN ('deceased', 'culled') ORDER BY tagId ASC"
    );

    const rows: FertilityRow[] = [];
    let overallBreedings = 0;
    let overallKindlings = 0;
    let overallBornAlive = 0;
    let overallWeaned = 0;
    let overallBornAliveForWeaned = 0;

    for (const doe of does) {
      // Query all breedings and litters for this doe
      const breedings = await queryAll<{
        id: string;
        matingDate: string | null;
        actualKindlingDate: string | null;
        bornAlive: number | null;
        weaned: number | null;
      }>(
        db,
        `SELECT b.id, b.matingDate, b.actualKindlingDate, l.bornAlive, l.weaned
         FROM breeding b
         LEFT JOIN litter l ON l.breedingId = b.id
         WHERE b.doeId = ? AND b.matingDate IS NOT NULL`,
        [doe.id]
      );

      const totalBreedings = breedings.length;
      const kindlings = breedings.filter((b) => b.actualKindlingDate !== null);
      const totalKindlings = kindlings.length;

      const fertilityRate = totalBreedings > 0 ? (totalKindlings / totalBreedings) * 100 : null;

      const litters = kindlings.filter((b) => b.bornAlive !== null);
      const totalBornAlive = litters.reduce((sum, b) => sum + (b.bornAlive ?? 0), 0);
      const avgBorn = totalKindlings > 0 ? totalBornAlive / totalKindlings : null;

      const littersWithWeaning = litters.filter((b) => b.weaned !== null);
      const totalWeaned = littersWithWeaning.reduce((sum, b) => sum + (b.weaned ?? 0), 0);
      const avgWeaned = totalKindlings > 0 ? totalWeaned / totalKindlings : null;

      const totalBornAliveForWeaned = littersWithWeaning.reduce((sum, b) => sum + (b.bornAlive ?? 0), 0);
      const weaningSurvivalRate =
        totalBornAliveForWeaned > 0 ? (totalWeaned / totalBornAliveForWeaned) * 100 : null;

      // Add to aggregate counts
      overallBreedings += totalBreedings;
      overallKindlings += totalKindlings;
      overallBornAlive += totalBornAlive;
      overallWeaned += totalWeaned;
      overallBornAliveForWeaned += totalBornAliveForWeaned;

      rows.push({
        id: doe.id,
        tagId: doe.tagId,
        breed: doe.breed,
        status: doe.status,
        doeState: doe.doeState,
        totalBreedings,
        totalKindlings,
        fertilityRate,
        avgBorn,
        avgWeaned,
        weaningSurvivalRate,
      });
    }

    const overallFertility = overallBreedings > 0 ? Math.round((overallKindlings / overallBreedings) * 100) : 0;
    const overallAvgBorn = overallKindlings > 0 ? Number((overallBornAlive / overallKindlings).toFixed(1)) : 0;
    const overallAvgWeaned = overallKindlings > 0 ? Number((overallWeaned / overallKindlings).toFixed(1)) : 0;
    const overallSurvival = overallBornAliveForWeaned > 0 ? Math.round((overallWeaned / overallBornAliveForWeaned) * 100) : 0;

    setData({
      rows,
      overallFertility,
      overallKindlings,
      overallBreedings,
      overallSurvival,
      overallAvgWeaned,
      overallAvgBorn,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const listRows = data?.rows ?? [];
  const doesSort = useSortableRows(listRows, {
    doeTag: { type: "tag", value: (r) => r.tagId },
    breed: { type: "string", value: (r) => r.breed },
    status: { type: "string", value: (r) => r.status },
    doeState: { type: "string", value: (r) => r.doeState },
    breedings: { type: "number", value: (r) => r.totalBreedings },
    kindlings: { type: "number", value: (r) => r.totalKindlings },
    fertilityRate: { type: "number", value: (r) => r.fertilityRate ?? -1 },
    avgBorn: { type: "number", value: (r) => r.avgBorn ?? -1 },
    avgWeaned: { type: "number", value: (r) => r.avgWeaned ?? -1 },
    weaningSurvival: { type: "number", value: (r) => r.weaningSurvivalRate ?? -1 },
  });

  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Page Header */}
      {!hideHeader && (
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.description(listRows.length)}</p>
        </div>
      )}

      {listRows.length > 0 && (
        <div className="rounded-xl border bg-card text-card-foreground shadow-xs">
          <div className="px-6 py-4 border-b">
            <h3 className="text-base font-semibold leading-none tracking-tight">{t.statsHeading}</h3>
          </div>
          <div className="p-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCard
                icon={Percent}
                label={t.statFertilityRate}
                value={`${data.overallFertility}%`}
                className="border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              />
              <StatCard
                icon={HeartPulse}
                label={t.statTotalKindlings}
                value={data.overallKindlings.toString()}
                className="border-fuchsia-500/20 bg-fuchsia-500/5 dark:bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400"
              />
              <StatCard
                icon={HeartHandshake}
                label={t.statTotalBreedings}
                value={data.overallBreedings.toString()}
                className="border-violet-500/20 bg-violet-500/5 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400"
              />
              <StatCard
                icon={ShieldCheck}
                label={t.statWeaningSurvival}
                value={`${data.overallSurvival}%`}
                className="border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400"
              />
              <StatCard
                icon={Baby}
                label={t.statAvgWeaned}
                value={data.overallAvgWeaned.toFixed(1)}
                className="border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
              />
              <StatCard
                icon={Layers}
                label={t.statAvgBorn}
                value={data.overallAvgBorn.toFixed(1)}
                className="border-sky-500/20 bg-sky-500/5 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400"
              />
            </div>
          </div>
        </div>
      )}

      {listRows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground border rounded-xl bg-card">
          <RabbitIcon className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">{t.emptyTitle}</p>
          <p className="text-sm">{t.emptyDescription}</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto shadow-xs">
          <table className="w-full text-sm text-left rtl:text-right border-collapse">
            <thead className="bg-muted text-muted-foreground text-xs uppercase">
              <tr className="[&>th]:border-x">
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colDoeTag}
                  sortKey="doeTag"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colBreed}
                  sortKey="breed"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colStatus}
                  sortKey="status"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colDoeState}
                  sortKey="doeState"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colBreedings}
                  sortKey="breedings"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colKindlings}
                  sortKey="kindlings"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colFertilityRate}
                  sortKey="fertilityRate"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colAvgBorn}
                  sortKey="avgBorn"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colAvgWeaned}
                  sortKey="avgWeaned"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
                <SortableTh
                  className="px-2 py-2 md:px-4 md:py-3 text-center"
                  label={t.colWeaningSurvivalRate}
                  sortKey="weaningSurvival"
                  activeSortKey={doesSort.sortKey}
                  direction={doesSort.direction}
                  onSort={doesSort.toggleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {doesSort.sorted.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        window.location.hash = `#/rabbits/${r.id}`;
                      }}
                      className="hover:underline text-primary"
                    >
                      {r.tagId}
                    </button>
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5">{r.breed ?? "—"}</td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5">
                    <StatusBadge value={r.status} locale={locale} />
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5">
                    <DoeStateBadge current={r.doeState} locale={locale} />
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums">{r.totalBreedings}</td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums">{r.totalKindlings}</td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                    {r.fertilityRate != null ? `${Math.round(r.fertilityRate)}%` : "—"}
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums text-sky-600 dark:text-sky-400">
                    {r.avgBorn != null ? r.avgBorn.toFixed(1) : "—"}
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums text-amber-600 dark:text-amber-400">
                    {r.avgWeaned != null ? r.avgWeaned.toFixed(1) : "—"}
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums text-rose-600 dark:text-rose-400">
                    {r.weaningSurvivalRate != null ? `${Math.round(r.weaningSurvivalRate)}%` : "—"}
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
