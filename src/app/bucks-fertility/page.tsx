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
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.bucksFertility.title} · RabbitTrack` };
}

export default async function BucksFertilityPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  const [bucks, matingGroups, kindlingGroups, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: { sex: "buck", tagId: { not: null }, status: { notIn: ["deceased", "culled"] } },
      orderBy: { tagId: "asc" },
      select: {
        id: true,
        tagId: true,
        breed: true,
        status: true,
      },
    }),
    // Lifetime counts come from the append-only archive logs, NOT the live
    // Breeding row: it's nulled and reused on the doe's next cycle (see
    // breeding-ops markKindled), so counting off it drops every past mating the
    // moment she kindles. These logs only reset when an operations/data reset
    // clears them.
    prisma.matingLog.groupBy({ by: ["buckId"], _count: { _all: true } }),
    // bornAliveAtKindling, not bornAlive: a buck's litter size is what he
    // sired, and fostering kits away from the doe afterwards doesn't change
    // that. Using the nursing count here would also disagree with the same
    // figure on his own page (buck-breeding-history).
    prisma.kindlingLog.groupBy({
      by: ["buckId"],
      _count: { _all: true },
      _sum: { bornAliveAtKindling: true },
    }),
    getDictionary(),
  ]);

  const matingByBuck = new Map(matingGroups.map((g) => [g.buckId, g._count._all]));
  const kindlingByBuck = new Map(
    kindlingGroups.map((g) => [
      g.buckId,
      { count: g._count._all, bornAtKindling: g._sum.bornAliveAtKindling ?? 0 },
    ])
  );

  // Aggregate stats across all bucks
  let overallBreedings = 0;
  let overallKindlings = 0;
  let overallBornAtKindling = 0;

  const rowData = bucks.map((buck) => {
    const totalBreedings = matingByBuck.get(buck.id) ?? 0;
    const k = kindlingByBuck.get(buck.id);
    const totalKindlings = k?.count ?? 0;
    const totalBornAtKindling = k?.bornAtKindling ?? 0;

    // Plain kindlings ÷ matings, both straight off the archive logs. An
    // earlier version subtracted still-open matings from the denominator so a
    // pending result wouldn't read as a failure, but the two sides came from
    // different sources — the numerator from the whole archive, the open count
    // from the single live Breeding row per doe — and could disagree badly
    // enough to print rates above 100%. One source, one denominator.
    const fertilityRate = totalBreedings > 0 ? (totalKindlings / totalBreedings) * 100 : null;
    const avgBorn = totalKindlings > 0 ? totalBornAtKindling / totalKindlings : null;

    // Add to aggregate counts
    overallBreedings += totalBreedings;
    overallKindlings += totalKindlings;
    overallBornAtKindling += totalBornAtKindling;

    return {
      buck,
      totalBreedings,
      totalKindlings,
      fertilityRate,
      avgBorn,
      totalBornAtKindling,
    };
  });

  const overallFertility = overallBreedings > 0 ? Math.round((overallKindlings / overallBreedings) * 100) : 0;
  const overallAvgBorn = overallKindlings > 0 ? Number((overallBornAtKindling / overallKindlings).toFixed(1)) : 0;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {!hideHeader && (
        <PageHeader
          title={t.bucksFertility.title}
          description={t.bucksFertility.description(bucks.length)}
        />
      )}

      {bucks.length > 0 && (
        <Card className="glass-card border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold tracking-tight">
              {t.bucksFertility.statsHeading}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
              <StatCard
                icon={Percent}
                label={t.bucksFertility.statFertilityRate}
                value={`${overallFertility}%`}
                className="border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              />
              <StatCard
                icon={HeartPulse}
                label={t.bucksFertility.statTotalKindlings}
                value={overallKindlings.toString()}
                className="border-fuchsia-500/20 bg-fuchsia-500/5 dark:bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400"
              />
              <StatCard
                icon={HeartHandshake}
                label={t.bucksFertility.statTotalBreedings}
                value={overallBreedings.toString()}
                className="border-violet-500/20 bg-violet-500/5 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400"
              />
              <StatCard
                icon={Layers}
                label={t.bucksFertility.statTotalBorn}
                value={overallBornAtKindling.toString()}
                className="border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400"
              />
              <StatCard
                icon={Baby}
                label={t.bucksFertility.statAvgBorn}
                value={overallAvgBorn.toFixed(1)}
                className="border-sky-500/20 bg-sky-500/5 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {bucks.length === 0 ? (
        <EmptyState
          icon={RabbitIcon}
          title={t.bucksFertility.emptyTitle}
          description={t.bucksFertility.emptyDescription}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <SortableTable
            headerRowClassName="[&>th]:border-x"
            initialSortKey="buckTag"
            columns={[
              { key: "buckTag", label: t.bucksFertility.colBuckTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.bucksFertility.colBreed, type: "string", className: "text-center" },
              { key: "status", label: t.bucksFertility.colStatus, type: "string", className: "text-center" },
              { key: "breedings", label: t.bucksFertility.colBreedings, type: "number", className: "text-center" },
              { key: "kindlings", label: t.bucksFertility.colKindlings, type: "number", className: "text-center" },
              { key: "fertilityRate", label: t.bucksFertility.colFertilityRate, type: "number", className: "text-center" },
              { key: "avgBorn", label: t.bucksFertility.colAvgBorn, type: "number", className: "text-center" },
              { key: "totalBorn", label: t.bucksFertility.colTotalBorn, type: "number", className: "text-center" },
            ]}
            rows={rowData.map(({ buck, totalBreedings, totalKindlings, fertilityRate, avgBorn, totalBornAtKindling }) => ({
              key: buck.id,
              sortValues: {
                buckTag: buck.tagId,
                breed: buck.breed,
                status: buck.status,
                breedings: totalBreedings,
                kindlings: totalKindlings,
                fertilityRate: fertilityRate ?? -1,
                avgBorn: avgBorn ?? -1,
                totalBorn: totalBornAtKindling,
              },
              node: (
                <TableRow key={buck.id} className="[&>td]:border-x [&>td]:text-center">
                  <TableCell className="font-medium">
                    <Link href={`/rabbits/${buck.id}`} className="hover:underline">
                      {buck.tagId ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{buck.breed ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge value={buck.status} locale={locale} />
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">{totalBreedings}</TableCell>
                  <TableCell className="font-medium tabular-nums">{totalKindlings}</TableCell>
                  <TableCell className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                    {fertilityRate != null ? `${Math.round(fertilityRate)}%` : "—"}
                  </TableCell>
                  <TableCell className="font-medium tabular-nums text-sky-600 dark:text-sky-400">
                    {avgBorn != null ? avgBorn.toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="font-medium tabular-nums text-rose-600 dark:text-rose-400">
                    {totalBornAtKindling}
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
        <p className="text-xs font-semibold uppercase tracking-wider opacity-85">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      </div>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl transition-all duration-300 shadow-xs bg-black/10 dark:bg-white/10">
        <Icon className="size-5" />
      </span>
    </div>
  );
}
