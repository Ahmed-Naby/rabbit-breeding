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
import { RabbitTagBadge } from "@/components/rabbit-tag-badge";
import { DoeStateBadge } from "../components/doe-state-menu";
import { SortableTh } from "@/components/sortable-th";
import { useSortableRows } from "@/lib/use-sortable-rows";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/skeleton";
import { EmptyState, PageHeader } from "@/components/page-header";

type FertilityRow = {
  id: string;
  tagId: string;
  breed: string | null;
  status: string;
  doeState: string;
  totalBreedings: number;
  totalKindlings: number;
  fertilityRate: number | null;
  /** «متوسط الخلفة» — from the frozen birth count, unmoved by fostering/deaths. */
  avgBornAtKindling: number | null;
  /** «متوسط الرعاية» — from the live nursing count. */
  avgBorn: number | null;
  avgWeaned: number | null;
  /** «متوسط وزن الفطام» — grams per kit, not per litter. */
  avgWeaningWeight: number | null;
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
    let overallWeanings = 0;
    let overallSurvivalWeaned = 0;
    let overallUnderCare = 0;

    for (const doe of does) {
      // Lifetime counts come from the append-only archive logs, NOT the live
      // breeding row: its matingDate/actualKindlingDate are nulled and the row
      // reused on the doe's next cycle (see breeding-ops markKindled), so
      // counting off it drops every past mating the moment she kindles. These
      // logs only grow — they reset to zero solely when an operations/data
      // reset clears them.
      const matingRow = await queryOne<{ c: number }>(
        db,
        "SELECT COUNT(*) AS c FROM mating_log WHERE doeId = ?",
        [doe.id]
      );
      const kindlingRow = await queryOne<{ c: number; born: number; bornAtKindling: number }>(
        db,
        `SELECT COUNT(*) AS c,
                COALESCE(SUM(bornAlive), 0) AS born,
                COALESCE(SUM(bornAliveAtKindling), 0) AS bornAtKindling
           FROM kindling_log WHERE doeId = ?`,
        [doe.id]
      );
      const weaningRow = await queryOne<{ c: number; weaned: number }>(
        db,
        "SELECT COUNT(*) AS c, COALESCE(SUM(weaned), 0) AS weaned FROM weaning_log WHERE doeId = ?",
        [doe.id]
      );
      // «نسبة بقاء الفطام» gets its own pass, mirroring the web page's second
      // groupBy: rows with the -1 "predates the column" sentinel are excluded
      // from BOTH sides, since summing the sentinel would inflate the
      // denominator. underCare = Σ(bornAlive + نافق الرعاية) — the kits she
      // actually raised, not the ones that survived.
      const survivalRow = await queryOne<{ weaned: number; underCare: number }>(
        db,
        `SELECT COALESCE(SUM(weaned), 0) AS weaned,
                COALESCE(SUM(bornAlive + bornDead - bornDeadAtKindling), 0) AS underCare
           FROM weaning_log WHERE doeId = ? AND bornDeadAtKindling >= 0`,
        [doe.id]
      );
      // «متوسط وزن الفطام»: Σ(وزن البطن) ÷ Σ(عدد الفطام). Mirrors the web
      // page's third groupBy — rows with no weight recorded are dropped from
      // BOTH sides, since counting their kits without their grams would drag
      // the average down.
      const weightRow = await queryOne<{ grams: number; weaned: number }>(
        db,
        `SELECT COALESCE(SUM(weaningWeightGrams), 0) AS grams,
                COALESCE(SUM(weaned), 0) AS weaned
           FROM weaning_log
          WHERE doeId = ? AND weaningWeightGrams IS NOT NULL AND weaned > 0`,
        [doe.id]
      );
      const totalBreedings = matingRow?.c ?? 0;
      const totalKindlings = kindlingRow?.c ?? 0;
      const bornAlive = kindlingRow?.born ?? 0;
      const bornAtKindling = kindlingRow?.bornAtKindling ?? 0;
      const weanings = weaningRow?.c ?? 0;
      const weaned = weaningRow?.weaned ?? 0;
      const survivalWeaned = survivalRow?.weaned ?? 0;
      const underCare = survivalRow?.underCare ?? 0;

      // Plain kindlings ÷ matings, both straight off the archive logs. An
      // earlier version subtracted still-open matings from the denominator so
      // a pending result wouldn't read as a failure, but the two sides came
      // from different sources — the numerator from the whole archive, the
      // open count from the single live breeding row per doe — and could
      // disagree badly enough to print rates above 100%. One source, one
      // denominator.
      const fertilityRate = totalBreedings > 0 ? (totalKindlings / totalBreedings) * 100 : null;
      const avgBornAtKindling = totalKindlings > 0 ? bornAtKindling / totalKindlings : null;
      const avgBorn = totalKindlings > 0 ? bornAlive / totalKindlings : null;
      const avgWeaned = weanings > 0 ? weaned / weanings : null;
      // Weaned ÷ kits actually raised, NOT ÷ the surviving count: bornAlive is
      // decremented by every nursing death, so the old denominator shrank with
      // the numerator and scored a well-tracked doe at ~100%. Null while she
      // has no weaning newer than the bornDeadAtKindling column.
      const weaningSurvivalRate =
        underCare > 0 ? Math.min(100, (survivalWeaned / underCare) * 100) : null;
      // Both sides summed before dividing, so a 10-kit litter carries more
      // weight than a 2-kit one — averaging the per-litter averages would not.
      const avgWeaningWeight =
        weightRow && weightRow.weaned > 0 ? weightRow.grams / weightRow.weaned : null;

      // Add to aggregate counts
      overallBreedings += totalBreedings;
      overallKindlings += totalKindlings;
      overallBornAlive += bornAlive;
      overallWeaned += weaned;
      overallWeanings += weanings;
      overallSurvivalWeaned += survivalWeaned;
      overallUnderCare += underCare;

      rows.push({
        id: doe.id,
        tagId: doe.tagId,
        breed: doe.breed,
        status: doe.status,
        doeState: doe.doeState,
        totalBreedings,
        totalKindlings,
        fertilityRate,
        avgBornAtKindling,
        avgBorn,
        avgWeaned,
        avgWeaningWeight,
        weaningSurvivalRate,
      });
    }

    const overallFertility = overallBreedings > 0 ? Math.round((overallKindlings / overallBreedings) * 100) : 0;
    const overallAvgBorn = overallKindlings > 0 ? Number((overallBornAlive / overallKindlings).toFixed(1)) : 0;
    const overallAvgWeaned = overallWeanings > 0 ? Number((overallWeaned / overallWeanings).toFixed(1)) : 0;
    const overallSurvival =
      overallUnderCare > 0
        ? Math.min(100, Math.round((overallSurvivalWeaned / overallUnderCare) * 100))
        : 0;

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
    avgBornAtKindling: { type: "number", value: (r) => r.avgBornAtKindling ?? -1 },
    avgBorn: { type: "number", value: (r) => r.avgBorn ?? -1 },
    avgWeaned: { type: "number", value: (r) => r.avgWeaned ?? -1 },
    avgWeaningWeight: { type: "number", value: (r) => r.avgWeaningWeight ?? -1 },
    weaningSurvival: { type: "number", value: (r) => r.weaningSurvivalRate ?? -1 },
  }, { key: "doeTag" });

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
        <EmptyState icon={RabbitIcon} title={t.emptyTitle} description={t.emptyDescription} />
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
                  label={t.colAvgBornAtKindling}
                  sortKey="avgBornAtKindling"
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
                  label={t.colAvgWeaningWeight}
                  sortKey="avgWeaningWeight"
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
                    <RabbitTagBadge
                      tagId={r.tagId}
                      sex="doe"
                      onClick={() => {
                        window.location.hash = `#/rabbits/${r.id}`;
                      }}
                    />
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
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums text-indigo-600 dark:text-indigo-400">
                    {r.avgBornAtKindling != null ? r.avgBornAtKindling.toFixed(1) : "—"}
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums text-sky-600 dark:text-sky-400">
                    {r.avgBorn != null ? r.avgBorn.toFixed(1) : "—"}
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums text-amber-600 dark:text-amber-400">
                    {r.avgWeaned != null ? r.avgWeaned.toFixed(1) : "—"}
                  </td>
                  <td className="px-2 py-2 md:px-4 md:py-3.5 font-medium tabular-nums text-teal-600 dark:text-teal-400">
                    {r.avgWeaningWeight != null ? Math.round(r.avgWeaningWeight).toString() : "—"}
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
