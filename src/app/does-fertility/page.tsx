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
import { getSettings } from "@/lib/settings";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.doesFertility.title} · RabbitTrack` };
}

export default async function DoesFertilityPage() {
  const [does, settings, { locale, t }] = await Promise.all([
    prisma.rabbit.findMany({
      where: { sex: "doe", tagId: { not: null }, status: { notIn: ["deceased", "culled"] } },
      orderBy: { tagId: "asc" },
      include: {
        breedingsAsDoe: {
          include: {
            litter: true,
          },
        },
      },
    }),
    getSettings(),
    getDictionary(),
  ]);

  // Aggregate stats across all does
  let overallBreedings = 0;
  let overallKindlings = 0;
  let overallBornAlive = 0;
  let overallWeaned = 0;
  let overallBornAliveForWeaned = 0;

  const rowData = does.map((doe) => {
    const breedings = doe.breedingsAsDoe.filter((b) => b.matingDate !== null);
    const totalBreedings = breedings.length;
    const kindlings = breedings.filter((b) => b.actualKindlingDate !== null);
    const totalKindlings = kindlings.length;

    const fertilityRate = totalBreedings > 0 ? (totalKindlings / totalBreedings) * 100 : null;

    const litters = kindlings.map((b) => b.litter).filter((l) => l !== null);
    const totalBornAlive = litters.reduce((sum, l) => sum + l.bornAlive, 0);
    const avgBorn = totalKindlings > 0 ? totalBornAlive / totalKindlings : null;

    const littersWithWeaning = litters.filter((l) => l.weaned !== null);
    const totalWeaned = littersWithWeaning.reduce((sum, l) => sum + (l.weaned ?? 0), 0);
    const avgWeaned = totalKindlings > 0 ? totalWeaned / totalKindlings : null;

    const totalBornAliveForWeaned = littersWithWeaning.reduce((sum, l) => sum + l.bornAlive, 0);
    const weaningSurvivalRate =
      totalBornAliveForWeaned > 0 ? (totalWeaned / totalBornAliveForWeaned) * 100 : null;

    // Add to aggregate counts
    overallBreedings += totalBreedings;
    overallKindlings += totalKindlings;
    overallBornAlive += totalBornAlive;
    overallWeaned += totalWeaned;
    overallBornAliveForWeaned += totalBornAliveForWeaned;

    return {
      doe,
      totalBreedings,
      totalKindlings,
      fertilityRate,
      avgBorn,
      avgWeaned,
      weaningSurvivalRate,
    };
  });

  const overallFertility = overallBreedings > 0 ? Math.round((overallKindlings / overallBreedings) * 100) : 0;
  const overallAvgBorn = overallKindlings > 0 ? Number((overallBornAlive / overallKindlings).toFixed(1)) : 0;
  const overallAvgWeaned = overallKindlings > 0 ? Number((overallWeaned / overallKindlings).toFixed(1)) : 0;
  const overallSurvival = overallBornAliveForWeaned > 0 ? Math.round((overallWeaned / overallBornAliveForWeaned) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title={t.doesFertility.title}
        description={t.doesFertility.description(does.length)}
      />

      {does.length > 0 && (
        <>
          {/* Stats Heading */}
          <h2 className="text-lg font-semibold tracking-tight -mb-2">
            {t.doesFertility.statsHeading}
          </h2>

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
        </>
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
            columns={[
              { key: "doeTag", label: t.doesFertility.colDoeTag, type: "tag", className: "text-center" },
              { key: "breed", label: t.doesFertility.colBreed, type: "string", className: "text-center" },
              { key: "status", label: t.doesFertility.colStatus, type: "string", className: "text-center" },
              { key: "doeState", label: t.doesFertility.colDoeState, type: "string", className: "text-center" },
              { key: "breedings", label: t.doesFertility.colBreedings, type: "number", className: "text-center" },
              { key: "kindlings", label: t.doesFertility.colKindlings, type: "number", className: "text-center" },
              { key: "fertilityRate", label: t.doesFertility.colFertilityRate, type: "number", className: "text-center" },
              { key: "avgBorn", label: t.doesFertility.colAvgBorn, type: "number", className: "text-center" },
              { key: "avgWeaned", label: t.doesFertility.colAvgWeaned, type: "number", className: "text-center" },
              { key: "weaningSurvival", label: t.doesFertility.colWeaningSurvivalRate, type: "number", className: "text-center" },
            ]}
            rows={rowData.map(({ doe, totalBreedings, totalKindlings, fertilityRate, avgBorn, avgWeaned, weaningSurvivalRate }) => ({
              key: doe.id,
              sortValues: {
                doeTag: doe.tagId,
                breed: doe.breed,
                status: doe.status,
                doeState: doe.doeState,
                breedings: totalBreedings,
                kindlings: totalKindlings,
                fertilityRate: fertilityRate ?? -1,
                avgBorn: avgBorn ?? -1,
                avgWeaned: avgWeaned ?? -1,
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
                  <TableCell className="font-medium tabular-nums text-sky-600 dark:text-sky-400">
                    {avgBorn != null ? avgBorn.toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="font-medium tabular-nums text-amber-600 dark:text-amber-400">
                    {avgWeaned != null ? avgWeaned.toFixed(1) : "—"}
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
    <Card className={cn("transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] shadow-xs glass-card border", className)}>
      <CardContent className="flex items-center justify-between py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
        </div>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl transition-all duration-300 shadow-xs bg-black/10 dark:bg-white/10">
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}
