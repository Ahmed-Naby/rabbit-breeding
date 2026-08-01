import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  computeHerdProductivity,
  findIdleDoes,
  rebreedTarget,
  type HerdReport,
} from "@/lib/herd-productivity";

export type { HerdReport };

const DAY_MS = 86_400_000;

/**
 * Data for the «إنتاجية القطيع» tab. `to` is the EXCLUSIVE upper bound, same
 * contract as getFollowUpReport.
 *
 * Everything period-bound is read from the permanent *Log archives, never from
 * Litter/Breeding: those rows are recycled by the doe's next kindling, so a
 * herd-level historical series built on them silently loses every cycle that
 * has since been superseded — which on a productive farm is most of them.
 */
export async function getHerdReport(from: Date, to: Date): Promise<HerdReport> {
  const dateRange = { gte: from, lt: to };

  const [
    settings,
    doeRows,
    kindlings,
    weanings,
    weanedStockDeathAgg,
    saleAgg,
    incomeAgg,
    expenseAgg,
    feedExpenseAgg,
    lastKindlings,
  ] = await Promise.all([
    getSettings(),
    // The denominator, and the same population the does board shows: tagged
    // and active. A نافقة or مستبعدة doe is out of the herd, so charging the
    // farm for her cage would understate every rate below.
    prisma.rabbit.findMany({
      where: { sex: "doe", tagId: { not: null }, status: "active" },
      select: {
        id: true,
        tagId: true,
        breed: true,
        acquiredDate: true,
        dateOfBirth: true,
        createdAt: true,
      },
      orderBy: { tagId: "asc" },
    }),
    prisma.kindlingLog.findMany({
      where: { kindlingDate: dateRange },
      select: { bornAliveAtKindling: true, bornAlive: true, bornDead: true },
    }),
    prisma.weaningLog.findMany({
      where: { weaningDate: dateRange, weaned: { not: null } },
      select: { weaned: true },
    }),
    prisma.kitStockMovement.aggregate({
      where: { type: "death", date: dateRange },
      _sum: { count: true },
    }),
    prisma.kitStockMovement.aggregate({
      where: { type: "sale", date: dateRange },
      _sum: { count: true, weightGrams: true, amountCents: true },
    }),
    // Transaction, not the sale movements' amountCents: the farm may also sell
    // culled does, bucks, or manure, and every one of those is real income the
    // does' cages helped produce. The kit-sale rows are mirrored into
    // Transaction anyway, so reading the ledger avoids double counting them.
    prisma.transaction.aggregate({
      where: { type: "income", date: dateRange },
      _sum: { amountCents: true },
    }),
    prisma.transaction.aggregate({
      where: { type: "expense", date: dateRange },
      _sum: { amountCents: true },
    }),
    // Feed alone, so the bill can be turned back into kilograms at the farm's
    // ton price and compared against the meat it produced.
    prisma.transaction.aggregate({
      where: { type: "expense", category: "feed", date: dateRange },
      _sum: { amountCents: true },
    }),
    // Latest kindling per doe, over ALL time — deliberately not bounded by the
    // period. "She hasn't kindled in the last week" is meaningless; "she hasn't
    // kindled in 140 days" is a culling decision, and only unbounded history
    // can tell the two apart.
    prisma.kindlingLog.groupBy({
      by: ["doeId"],
      _max: { kindlingDate: true },
    }),
  ]);

  const lastByDoe = new Map(lastKindlings.map((r) => [r.doeId, r._max.kindlingDate]));

  const periodDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
  const { cycleDays, targetCyclesPerYear } = rebreedTarget(settings.rebreedAfterKindlingDays);

  const productivity = computeHerdProductivity({
    doeCount: doeRows.length,
    periodDays,
    cycleDays,
    targetCyclesPerYear,
    kindlings,
    weanings,
    weanedStockDeaths: weanedStockDeathAgg._sum.count ?? 0,
    soldCount: saleAgg._sum.count ?? 0,
    soldWeightGrams: saleAgg._sum.weightGrams ?? 0,
    incomeCents: incomeAgg._sum.amountCents ?? 0,
    expenseCents: expenseAgg._sum.amountCents ?? 0,
    soldAmountCents: saleAgg._sum.amountCents ?? 0,
    feedExpenseCents: feedExpenseAgg._sum.amountCents ?? 0,
    feedPricePerTonCents: settings.feedPricePerTonCents,
  });

  // Idleness is measured from now, not from the period end: it is a current
  // state ("who is sitting idle in the barn today"), the same way the herd and
  // stock balance cards on the follow-up report are current snapshots.
  const idleDoes = findIdleDoes(
    doeRows.map((d) => ({
      id: d.id,
      tagId: d.tagId,
      breed: d.breed,
      lastKindlingDate: lastByDoe.get(d.id) ?? null,
      enteredHerdAt: d.acquiredDate ?? d.dateOfBirth ?? d.createdAt,
    })),
    cycleDays,
    new Date()
  );

  return { productivity, idleDoes, cycleDays, currency: settings.currency };
}
