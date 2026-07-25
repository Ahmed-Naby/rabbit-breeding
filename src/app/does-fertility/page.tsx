import Link from "next/link";
import {
  Percent,
  HeartPulse,
  HeartHandshake,
  ShieldCheck,
  Baby,
  Layers,
  Rabbit as RabbitIcon,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TableRow, TableCell } from "@/components/ui/table";
import { SortableTable } from "@/components/ui/sortable-table";
import { StatusBadge } from "@/components/status-badge";
import { DoeStateBadge } from "../does/doe-state-menu";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.doesFertility.title} · RabbitTrack` };
}

export default async function DoesFertilityPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  const [
    does,
    matingGroups,
    kindlingGroups,
    weaningGroups,
    survivalGroups,
    weightGroups,
    { locale, t },
  ] = await Promise.all([
    prisma.rabbit.findMany({
      where: { sex: "doe", tagId: { not: null }, status: { notIn: ["deceased", "culled"] } },
      orderBy: { tagId: "asc" },
      select: {
        id: true,
        tagId: true,
        breed: true,
        status: true,
        doeState: true,
      },
    }),
    // Lifetime counts come from the append-only archive logs, NOT the live
    // Breeding row: a Breeding row's matingDate/actualKindlingDate are nulled
    // and the row reused on the doe's next cycle (see breeding-ops markKindled),
    // so counting off it drops every past mating the moment she kindles. These
    // logs only grow — they reset to zero solely when an operations/data reset
    // clears them.
    prisma.matingLog.groupBy({ by: ["doeId"], _count: { _all: true } }),
    // Both born counts: bornAliveAtKindling is frozen at birth («متوسط الخلفة»),
    // bornAlive is what she ended up nursing after fostering/deaths («متوسط الرعاية»).
    prisma.kindlingLog.groupBy({
      by: ["doeId"],
      _count: { _all: true },
      _sum: { bornAlive: true, bornAliveAtKindling: true },
    }),
    prisma.weaningLog.groupBy({ by: ["doeId"], _count: { _all: true }, _sum: { weaned: true } }),
    // «نسبة بقاء الفطام» needs its own pass, filtered to rows that predate
    // nothing: a -1 bornDeadAtKindling is a "unknown" sentinel, not a count, and
    // summing it would silently inflate every doe's denominator. Excluding those
    // rows from BOTH sides keeps the ratio honest — a doe whose whole history
    // predates the column simply has no rate, same as the per-row helper.
    prisma.weaningLog.groupBy({
      by: ["doeId"],
      where: { bornDeadAtKindling: { gte: 0 } },
      _sum: { weaned: true, bornAlive: true, bornDead: true, bornDeadAtKindling: true },
    }),
    // «متوسط وزن الفطام»: Σ(وزن البطن) ÷ Σ(عدد الفطام) — the weight of one kit,
    // not of a litter. Its own pass because weaningWeightGrams is nullable and
    // is not filled for every weaning: a row with kits but no weight recorded
    // would add to the denominator while adding nothing to the numerator and
    // drag the average down. Excluded from BOTH sides, same shape as the
    // survival pass above. `weaned > 0` guards the division and drops rows that
    // carry a weight but no count.
    prisma.weaningLog.groupBy({
      by: ["doeId"],
      where: { weaningWeightGrams: { not: null }, weaned: { gt: 0 } },
      _sum: { weaningWeightGrams: true, weaned: true },
    }),
    getDictionary(),
  ]);

  const matingByDoe = new Map(matingGroups.map((g) => [g.doeId, g._count._all]));
  const kindlingByDoe = new Map(
    kindlingGroups.map((g) => [
      g.doeId,
      {
        count: g._count._all,
        bornAlive: g._sum.bornAlive ?? 0,
        bornAtKindling: g._sum.bornAliveAtKindling ?? 0,
      },
    ])
  );
  const weaningByDoe = new Map(
    weaningGroups.map((g) => [g.doeId, { count: g._count._all, weaned: g._sum.weaned ?? 0 }])
  );
  // Numerator and denominator for «نسبة بقاء الفطام», summed per doe so a
  // 12-kit litter outweighs a 2-kit one — averaging the per-litter percentages
  // would give them equal say. The denominator is Σ(bornAlive + نافق الرعاية),
  // i.e. the kits she actually raised; see kitsUnderCare in kit-mortality.ts.
  const survivalByDoe = new Map(
    survivalGroups.map((g) => [
      g.doeId,
      {
        weaned: g._sum.weaned ?? 0,
        // Math.max(0, …) can't be expressed inside a SQL sum, so a row whose
        // «نافق» was hand-edited BELOW its birth value subtracts here instead
        // of clamping to zero. The Math.min(1, …) inside survivalRate still
        // caps the printed result at 100%.
        underCare:
          (g._sum.bornAlive ?? 0) + (g._sum.bornDead ?? 0) - (g._sum.bornDeadAtKindling ?? 0),
      },
    ])
  );
  const weightByDoe = new Map(
    weightGroups.map((g) => [
      g.doeId,
      { grams: g._sum.weaningWeightGrams ?? 0, weaned: g._sum.weaned ?? 0 },
    ])
  );

  // Aggregate stats across all does
  let overallBreedings = 0;
  let overallKindlings = 0;
  let overallBornAlive = 0;
  let overallWeaned = 0;
  let overallWeanings = 0;
  let overallSurvivalWeaned = 0;
  let overallUnderCare = 0;

  const rowData = does.map((doe) => {
    const totalBreedings = matingByDoe.get(doe.id) ?? 0;
    const k = kindlingByDoe.get(doe.id);
    const totalKindlings = k?.count ?? 0;
    const bornAlive = k?.bornAlive ?? 0;
    const bornAtKindling = k?.bornAtKindling ?? 0;
    const w = weaningByDoe.get(doe.id);
    const weanings = w?.count ?? 0;
    const weaned = w?.weaned ?? 0;
    const s = survivalByDoe.get(doe.id);
    const wt = weightByDoe.get(doe.id);

    // Plain kindlings ÷ matings, both straight off the archive logs. An
    // earlier version subtracted still-open matings from the denominator so a
    // pending result wouldn't read as a failure, but the two sides came from
    // different sources — the numerator from the whole archive, the open count
    // from the single live Breeding row per doe — and could disagree badly
    // enough to print rates above 100%. One source, one denominator.
    const fertilityRate = totalBreedings > 0 ? (totalKindlings / totalBreedings) * 100 : null;
    const avgBornAtKindling = totalKindlings > 0 ? bornAtKindling / totalKindlings : null;
    const avgBorn = totalKindlings > 0 ? bornAlive / totalKindlings : null;
    const avgWeaned = weanings > 0 ? weaned / weanings : null;
    // Weaned ÷ kits actually raised, NOT ÷ the surviving count: bornAlive is
    // decremented by every nursing death, so the old denominator shrank with
    // the numerator and scored a well-tracked doe at ~100%. Null while she has
    // no weaning newer than the bornDeadAtKindling column.
    const weaningSurvivalRate =
      s && s.underCare > 0 ? Math.min(100, (s.weaned / s.underCare) * 100) : null;
    // Both sides summed before dividing, so a 10-kit litter carries more weight
    // than a 2-kit one — averaging the per-litter averages would not.
    const avgWeaningWeight = wt && wt.weaned > 0 ? wt.grams / wt.weaned : null;

    // Add to aggregate counts
    overallBreedings += totalBreedings;
    overallKindlings += totalKindlings;
    overallBornAlive += bornAlive;
    overallWeaned += weaned;
    overallWeanings += weanings;
    overallSurvivalWeaned += s?.weaned ?? 0;
    overallUnderCare += s?.underCare ?? 0;

    return {
      doe,
      id: doe.id,
      tagId: doe.tagId!,
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
    };
  });

  const overallFertility = overallBreedings > 0 ? Math.round((overallKindlings / overallBreedings) * 100) : 0;
  const overallAvgBorn = overallKindlings > 0 ? Number((overallBornAlive / overallKindlings).toFixed(1)) : 0;
  const overallAvgWeaned = overallWeanings > 0 ? Number((overallWeaned / overallWeanings).toFixed(1)) : 0;
  const overallSurvival =
    overallUnderCare > 0
      ? Math.min(100, Math.round((overallSurvivalWeaned / overallUnderCare) * 100))
      : 0;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {!hideHeader && (
        <PageHeader
          title={t.doesFertility.title}
          description={t.doesFertility.description(does.length)}
        />
      )}

      {does.length > 0 && (
        <Card className="glass-card border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold tracking-tight">
              {t.doesFertility.statsHeading}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
              <StatCard
                icon={Percent}
                label={t.doesFertility.statFertilityRate}
                value={`${overallFertility}%`}
                className="border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              />
              <StatCard
                icon={HeartPulse}
                label={t.doesFertility.statTotalKindlings}
                value={overallKindlings.toString()}
                className="border-fuchsia-500/20 bg-fuchsia-500/5 dark:bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400"
              />
              <StatCard
                icon={HeartHandshake}
                label={t.doesFertility.statTotalBreedings}
                value={overallBreedings.toString()}
                className="border-violet-500/20 bg-violet-500/5 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400"
              />
              <StatCard
                icon={ShieldCheck}
                label={t.doesFertility.statWeaningSurvival}
                value={`${overallSurvival}%`}
                className="border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400"
              />
              <StatCard
                icon={Baby}
                label={t.doesFertility.statAvgWeaned}
                value={overallAvgWeaned.toFixed(1)}
                className="border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
              />
              <StatCard
                icon={Layers}
                label={t.doesFertility.statAvgBorn}
                value={overallAvgBorn.toFixed(1)}
                className="border-sky-500/20 bg-sky-500/5 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {does.length === 0 ? (
        <EmptyState
          icon={RabbitIcon}
          title={t.doesFertility.emptyTitle}
          description={t.doesFertility.emptyDescription}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            initialSortKey="doeTag"
            columns={[
              { key: "doeTag", label: t.doesFertility.colDoeTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.doesFertility.colBreed, type: "string", className: "text-center" },
              { key: "status", label: t.doesFertility.colStatus, type: "string", className: "text-center" },
              { key: "doeState", label: t.doesFertility.colDoeState, type: "string", className: "text-center" },
              { key: "breedings", label: t.doesFertility.colBreedings, type: "number", className: "text-center" },
              { key: "kindlings", label: t.doesFertility.colKindlings, type: "number", className: "text-center" },
              { key: "fertilityRate", label: t.doesFertility.colFertilityRate, type: "number", className: "text-center" },
              { key: "avgBornAtKindling", label: t.doesFertility.colAvgBornAtKindling, type: "number", className: "text-center" },
              { key: "avgBorn", label: t.doesFertility.colAvgBorn, type: "number", className: "text-center" },
              { key: "avgWeaned", label: t.doesFertility.colAvgWeaned, type: "number", className: "text-center" },
              { key: "avgWeaningWeight", label: t.doesFertility.colAvgWeaningWeight, type: "number", className: "text-center" },
              { key: "weaningSurvival", label: t.doesFertility.colWeaningSurvivalRate, type: "number", className: "text-center" },
            ]}
            rows={rowData.map(({ doe, totalBreedings, totalKindlings, fertilityRate, avgBornAtKindling, avgBorn, avgWeaned, avgWeaningWeight, weaningSurvivalRate }) => ({
              key: doe.id,
              sortValues: {
                doeTag: doe.tagId,
                breed: doe.breed,
                status: doe.status,
                doeState: doe.doeState,
                breedings: totalBreedings,
                kindlings: totalKindlings,
                fertilityRate: fertilityRate ?? -1,
                avgBornAtKindling: avgBornAtKindling ?? -1,
                avgBorn: avgBorn ?? -1,
                avgWeaned: avgWeaned ?? -1,
                avgWeaningWeight: avgWeaningWeight ?? -1,
                weaningSurvival: weaningSurvivalRate ?? -1,
              },
              node: (
                <TableRow key={doe.id} className="[&>td]:border-x [&>td]:text-center">
                  <TableCell className="font-medium">
                    <Link href={`/rabbits/${doe.id}`} className="hover:underline">
                      {doe.tagId ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{doe.breed ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge value={doe.status} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <DoeStateBadge current={doe.doeState} locale={locale} />
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">{totalBreedings}</TableCell>
                  <TableCell className="font-medium tabular-nums">{totalKindlings}</TableCell>
                  <TableCell className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                    {fertilityRate != null ? `${Math.round(fertilityRate)}%` : "—"}
                  </TableCell>
                  <TableCell className="font-medium tabular-nums text-indigo-600 dark:text-indigo-400">
                    {avgBornAtKindling != null ? avgBornAtKindling.toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="font-medium tabular-nums text-sky-600 dark:text-sky-400">
                    {avgBorn != null ? avgBorn.toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="font-medium tabular-nums text-amber-600 dark:text-amber-400">
                    {avgWeaned != null ? avgWeaned.toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="font-medium tabular-nums text-teal-600 dark:text-teal-400">
                    {avgWeaningWeight != null ? Math.round(avgWeaningWeight).toString() : "—"}
                  </TableCell>
                  <TableCell className="font-medium tabular-nums text-rose-600 dark:text-rose-400">
                    {weaningSurvivalRate != null ? `${Math.round(weaningSurvivalRate)}%` : "—"}
                  </TableCell>
                </TableRow>
              ),
            }))}
          />
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
        <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      </div>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl transition-all duration-300 shadow-xs bg-black/10 dark:bg-white/10">
        <Icon className="size-5" />
      </span>
    </div>
  );
}
