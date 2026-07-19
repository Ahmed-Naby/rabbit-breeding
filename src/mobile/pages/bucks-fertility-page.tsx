import { useEffect, useState, useCallback } from "react";
import {
  Percent,
  HeartPulse,
  HeartHandshake,
  Baby,
  Layers,
  Rabbit as RabbitIcon,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { getDb } from "../db/client";
import { queryAll } from "../db/helpers";
import { StatusBadge } from "@/components/status-badge";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";
import { cn } from "@/lib/utils";

type FertilityRow = {
  id: string;
  tagId: string;
  breed: string | null;
  status: string;
  totalBreedings: number;
  totalKindlings: number;
  fertilityRate: number | null;
  avgBorn: number | null;
  totalBornAlive: number;
};

export function BucksFertilityPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale).bucksFertility;
  const [data, setData] = useState<{
    rows: FertilityRow[];
    overallFertility: number;
    overallKindlings: number;
    overallBreedings: number;
    overallBornAlive: number;
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
    let overallKindlings = 0;
    let overallBornAlive = 0;

    for (const buck of bucks) {
      // Query all breedings and litters sired by this buck
      const breedings = await queryAll<{
        id: string;
        matingDate: string | null;
        actualKindlingDate: string | null;
        bornAlive: number | null;
      }>(
        db,
        `SELECT b.id, b.matingDate, b.actualKindlingDate, l.bornAlive
         FROM breeding b
         LEFT JOIN litter l ON l.breedingId = b.id
         WHERE b.buckId = ? AND b.matingDate IS NOT NULL`,
        [buck.id]
      );

      const totalBreedings = breedings.length;
      const kindlings = breedings.filter((b) => b.actualKindlingDate !== null);
      const totalKindlings = kindlings.length;

      const fertilityRate = totalBreedings > 0 ? (totalKindlings / totalBreedings) * 100 : null;

      const litters = kindlings.filter((b) => b.bornAlive !== null);
      const totalBornAlive = litters.reduce((sum, b) => sum + (b.bornAlive ?? 0), 0);
      const avgBorn = totalKindlings > 0 ? totalBornAlive / totalKindlings : null;

      // Add to aggregate counts
      overallBreedings += totalBreedings;
      overallKindlings += totalKindlings;
      overallBornAlive += totalBornAlive;

      rows.push({
        id: buck.id,
        tagId: buck.tagId,
        breed: buck.breed,
        status: buck.status,
        totalBreedings,
        totalKindlings,
        fertilityRate,
        avgBorn,
        totalBornAlive,
      });
    }

    const overallFertility = overallBreedings > 0 ? Math.round((overallKindlings / overallBreedings) * 100) : 0;
    const overallAvgBorn = overallKindlings > 0 ? Number((overallBornAlive / overallKindlings).toFixed(1)) : 0;

    setData({
      rows,
      overallFertility,
      overallKindlings,
      overallBreedings,
      overallBornAlive,
      overallAvgBorn,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const listRows = data?.rows ?? [];
  const bucksSort = useSortableRows(listRows, {
    buckTag: { type: "tag", value: (r) => r.tagId },
    breed: { type: "string", value: (r) => r.breed },
    status: { type: "string", value: (r) => r.status },
    breedings: { type: "number", value: (r) => r.totalBreedings },
    kindlings: { type: "number", value: (r) => r.totalKindlings },
    fertilityRate: { type: "number", value: (r) => r.fertilityRate ?? -1 },
    avgBorn: { type: "number", value: (r) => r.avgBorn ?? -1 },
    totalBorn: { type: "number", value: (r) => r.totalBornAlive },
  });

  if (!data) {
    return <p className="p-4 text-sm text-muted-foreground">{locale === "ar" ? "جارِ التحميل…" : "Loading…"}</p>;
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Page Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.description(listRows.length)}</p>
      </div>

      {listRows.length > 0 && (
        <div className="rounded-xl border bg-card text-card-foreground shadow-xs">
          <div className="px-6 py-4 border-b">
            <h3 className="text-base font-semibold leading-none tracking-tight">{t.statsHeading}</h3>
          </div>
          <div className="p-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
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
                icon={Layers}
                label={t.statTotalBorn}
                value={data.overallBornAlive.toString()}
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
                  label={t.colKindlings}
                  sortKey="kindlings"
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
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums">{r.totalBreedings}</td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums">{r.totalKindlings}</td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                    {r.fertilityRate != null ? `${Math.round(r.fertilityRate)}%` : "—"}
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums text-sky-600 dark:text-sky-400">
                    {r.avgBorn != null ? r.avgBorn.toFixed(1) : "—"}
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums text-rose-600 dark:text-rose-400">
                    {r.totalBornAlive}
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
