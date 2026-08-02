import Link from "next/link";
import {
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
import { ExportXlsxButton } from "@/components/export-xlsx-button";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.bucksFertility.title} · RabbitTrack` };
}

export default async function BucksFertilityPage({ hideHeader }: { hideHeader?: boolean } = {}) {
  const [bucks, matingGroups, positiveTests, kindlingGroups, { locale, t }] = await Promise.all([
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
    // A buck's rate is settling rate, so the numerator is confirmed
    // pregnancies, not kindlings — losing a confirmed pregnancy afterwards is
    // the doe's outcome, not his. Fetched rather than grouped because two
    // positives can exist for one mating (the palpation and the تأكيد الجس
    // re-check), and their matingDate timestamps can drift by a fraction; the
    // doe+day key below collapses both, exactly as buildBuckCycles does on his
    // own page, so the two never disagree.
    prisma.pregnancyTestLog.findMany({
      where: { result: "positive" },
      select: { buckId: true, doeId: true, matingDate: true },
    }),
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
  const pregnanciesByBuck = new Map<string, Set<string>>();
  for (const p of positiveTests) {
    if (!p.buckId) continue;
    const seen = pregnanciesByBuck.get(p.buckId) ?? new Set<string>();
    seen.add(`${p.doeId}_${p.matingDate.toISOString().slice(0, 10)}`);
    pregnanciesByBuck.set(p.buckId, seen);
  }
  const kindlingByBuck = new Map(
    kindlingGroups.map((g) => [
      g.buckId,
      { count: g._count._all, bornAtKindling: g._sum.bornAliveAtKindling ?? 0 },
    ])
  );

  // Aggregate stats across all bucks
  let overallBreedings = 0;
  let overallPregnancies = 0;
  let overallKindlings = 0;
  let overallBornAtKindling = 0;

  const rowData = bucks.map((buck) => {
    const totalBreedings = matingByBuck.get(buck.id) ?? 0;
    const k = kindlingByBuck.get(buck.id);
    const totalKindlings = k?.count ?? 0;
    const totalBornAtKindling = k?.bornAtKindling ?? 0;
    const totalPregnancies = pregnanciesByBuck.get(buck.id)?.size ?? 0;

    // Confirmed pregnancies ÷ matings. A buck's only job is settling the doe;
    // whether she then carries the litter to term is her outcome, so kindlings
    // stay out of the rate (they still drive avgBorn below). Same definition as
    // computeBuckFertilityStats on his own page.
    const fertilityRate = totalBreedings > 0 ? (totalPregnancies / totalBreedings) * 100 : null;
    const avgBorn = totalKindlings > 0 ? totalBornAtKindling / totalKindlings : null;

    // Add to aggregate counts
    overallBreedings += totalBreedings;
    overallPregnancies += totalPregnancies;
    overallKindlings += totalKindlings;
    overallBornAtKindling += totalBornAtKindling;

    return {
      buck,
      totalBreedings,
      totalPregnancies,
      fertilityRate,
      avgBorn,
      totalBornAtKindling,
    };
  });

  const overallFertility = overallBreedings > 0 ? Math.round((overallPregnancies / overallBreedings) * 100) : 0;
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
            <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight">
              {t.bucksFertility.statsHeading}
              {/* Bare figure, no label — same as تقرير خصوبة الأمهات. */}
              <span className="rounded-full bg-primary/10 px-3 py-0.5 text-lg font-bold tabular-nums text-primary">
                {overallFertility}%
              </span>
              {/* Here rather than beside the page title: this page is also
                  embedded in التقارير with its header hidden. */}
              <ExportXlsxButton
                className="ms-auto"
                locale={locale}
                spec={{
                  kind: "bucksFertility",
                  rows: rowData.map(({ buck, ...r }) => ({
                    tagId: buck.tagId!,
                    breed: buck.breed,
                    status: buck.status,
                    ...r,
                  })),
                }}
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {/* تلقيحات ← عشار: السبب قبل النتيجة، زي تقرير الأمهات.
                  معدل الخصوبة نفسه بقى بادج جنب العنوان. */}
              <StatCard
                icon={HeartHandshake}
                label={t.bucksFertility.statTotalBreedings}
                value={overallBreedings.toString()}
                className="border-violet-500/20 bg-violet-500/5 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400"
              />
              <StatCard
                icon={HeartPulse}
                label={t.bucksFertility.statPregnancies}
                value={overallPregnancies.toString()}
                className="border-fuchsia-500/20 bg-fuchsia-500/5 dark:bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400"
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
              { key: "pregnancies", label: t.bucksFertility.colPregnancies, type: "number", className: "text-center" },
              { key: "fertilityRate", label: t.bucksFertility.colFertilityRate, type: "number", className: "text-center" },
              { key: "avgBorn", label: t.bucksFertility.colAvgBorn, type: "number", className: "text-center" },
              { key: "totalBorn", label: t.bucksFertility.colTotalBorn, type: "number", className: "text-center" },
            ]}
            rows={rowData.map(({ buck, totalBreedings, totalPregnancies, fertilityRate, avgBorn, totalBornAtKindling }) => ({
              key: buck.id,
              sortValues: {
                buckTag: buck.tagId,
                breed: buck.breed,
                status: buck.status,
                breedings: totalBreedings,
                pregnancies: totalPregnancies,
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
                  <TableCell className="font-medium tabular-nums">{totalPregnancies}</TableCell>
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
