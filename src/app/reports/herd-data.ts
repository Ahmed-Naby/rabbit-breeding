import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  computeHerdProductivity,
  findIdleDoes,
  rebreedTarget,
  type HerdReport,
  type IdleDoesReport,
} from "@/lib/herd-productivity";
import { findWeakDoes, type WeakDoesReport } from "@/lib/weak-does";

export type { HerdReport, IdleDoesReport, WeakDoesReport };

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
    doeCount,
    kindlings,
    weanings,
    saleAgg,
    saleRows,
    transactionRows,
    allDoeRows,
    firstMatings,
    incomeAgg,
    expenseAgg,
    feedExpenseAgg,
    firstKindling,
  ] = await Promise.all([
    getSettings(),
    // The denominator, and the same population the does board shows: tagged
    // and active. A نافقة or مستبعدة doe is out of the herd, so charging the
    // farm for her cage would understate every rate below.
    prisma.rabbit.count({
      where: { sex: "doe", tagId: { not: null }, status: "active" },
    }),
    prisma.kindlingLog.findMany({
      where: { kindlingDate: dateRange },
      // The date alone: the cycles rate counts litters inside its own
      // (tail-clamped) window and needs nothing else — see computeHerdProductivity.
      select: { kindlingDate: true },
    }),
    prisma.weaningLog.findMany({
      where: { weaningDate: dateRange, weaned: { not: null } },
      select: { weaningDate: true, weaned: true },
    }),
    prisma.kitStockMovement.aggregate({
      where: { type: "sale", date: dateRange },
      _sum: { count: true, weightGrams: true, amountCents: true },
    }),
    // The same sales again, dated: «كجم مباع لكل أم شهريًا» averages them month
    // by month and an aggregate has no months in it.
    prisma.kitStockMovement.findMany({
      where: { type: "sale", date: dateRange },
      select: { date: true, count: true, weightGrams: true },
    }),
    prisma.transaction.findMany({
      where: { date: dateRange },
      select: { date: true, type: true, amountCents: true },
    }),
    // Enough of every doe — not just the tagged, active ones above — to rebuild
    // when she stood on the farm. See computeSalesPerDoe for the proxies.
    prisma.rabbit.findMany({
      where: { sex: "doe" },
      select: { id: true, status: true, acquiredDate: true, updatedAt: true },
    }),
    prisma.matingLog.groupBy({ by: ["doeId"], _min: { matingDate: true } }),
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
    // The farm's very first kindling — the earliest point at which any of the
    // rates below could have started accruing. See periodDays.
    prisma.kindlingLog.aggregate({ _min: { kindlingDate: true } }),
  ]);

  // Clamped to the window that could actually hold events before it's used as
  // a denominator: «إلغاء التصفية» asks for the whole record, which arrives here
  // as 1970→2999, and annualising over a thousand years printed 0.0 دورة لكل أم
  // on a farm doing perfectly well. The real span is from the first kindling to
  // today — the future can't have produced anything yet, and neither could the
  // years before the farm's first litter.
  const now = new Date();
  const firstEvent = firstKindling._min.kindlingDate;
  const effectiveFrom = firstEvent && firstEvent > from ? firstEvent : from;
  const effectiveTo = to > now ? now : to;
  const periodDays = Math.max(
    1,
    Math.round((effectiveTo.getTime() - effectiveFrom.getTime()) / DAY_MS)
  );
  const { cycleDays, targetCyclesPerYear } = rebreedTarget(settings.rebreedAfterKindlingDays);

  // Every doe who ever worked, not just today's herd: the monthly tiles divide
  // each month by the does standing THAT month, and a doe sold last spring was
  // standing then. See computeSalesPerDoe for why these fields stand in for
  // dates the schema does not keep.
  const firstMatingByDoe = new Map(
    firstMatings.map((g) => [g.doeId, g._min.matingDate?.getTime() ?? null])
  );
  const does = allDoeRows.flatMap((d) => {
    const fromMs = d.acquiredDate?.getTime() ?? firstMatingByDoe.get(d.id) ?? null;
    if (fromMs == null) return [];
    return [{ fromMs, toMs: d.status === "active" ? null : d.updatedAt.getTime() }];
  });

  const productivity = computeHerdProductivity({
    doeCount,
    periodDays,
    does,
    fromMs: effectiveFrom.getTime(),
    toMs: effectiveTo.getTime(),
    weaningEvents: weanings.map((w) => ({
      dateMs: w.weaningDate.getTime(),
      value: w.weaned ?? 0,
    })),
    saleEvents: saleRows.map((m) => ({
      dateMs: m.date.getTime(),
      count: m.count,
      grams: m.weightGrams ?? 0,
    })),
    incomeEvents: transactionRows
      .filter((t) => t.type === "income")
      .map((t) => ({ dateMs: t.date.getTime(), value: t.amountCents })),
    expenseEvents: transactionRows
      .filter((t) => t.type === "expense")
      .map((t) => ({ dateMs: t.date.getTime(), value: t.amountCents })),
    cycleDays,
    targetCyclesPerYear,
    kindlings: kindlings.map((k) => ({ dateMs: k.kindlingDate.getTime() })),
    weanings,
    soldCount: saleAgg._sum.count ?? 0,
    soldWeightGrams: saleAgg._sum.weightGrams ?? 0,
    incomeCents: incomeAgg._sum.amountCents ?? 0,
    expenseCents: expenseAgg._sum.amountCents ?? 0,
    soldAmountCents: saleAgg._sum.amountCents ?? 0,
    feedExpenseCents: feedExpenseAgg._sum.amountCents ?? 0,
    feedPricePerTonCents: settings.feedPricePerTonCents,
  });

  return { productivity, cycleDays, currency: settings.currency };
}

/**
 * Data for the «الأمهات الخاملة» tab.
 *
 * No date range, on purpose: idleness is measured from today, the same way the
 * herd and stock balance cards on the follow-up report are current snapshots.
 * A doe is either overdue for a kindling this morning or she is not, and a
 * range filter over that question would only invite an answer about a window
 * the barn has already left behind.
 */
export async function getIdleDoesReport(): Promise<IdleDoesReport> {
  const [settings, doeRows, lastKindlings] = await Promise.all([
    getSettings(),
    // The same population the does board shows: tagged and active. A نافقة or
    // مستبعدة doe has already left, so listing her as idle would be advice to
    // cull an animal that is not there.
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
    // Latest kindling per doe over ALL time. "She hasn't kindled in the last
    // week" is meaningless; "she hasn't kindled in 140 days" is a culling
    // decision, and only unbounded history can tell the two apart.
    prisma.kindlingLog.groupBy({ by: ["doeId"], _max: { kindlingDate: true } }),
  ]);

  const lastByDoe = new Map(lastKindlings.map((r) => [r.doeId, r._max.kindlingDate]));
  const { cycleDays } = rebreedTarget(settings.rebreedAfterKindlingDays);

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

  return { idleDoes, doeCount: doeRows.length, cycleDays };
}

/**
 * Data for the «أمهات ضعيفة الأداء» tab.
 *
 * No date range, like الأمهات الخاملة above and for a stronger reason: this is
 * a lifetime judgement on an animal, and culling on a window narrow enough to
 * be "recent" would sell a good doe over one unlucky quarter. See findWeakDoes.
 *
 * Everything is read from the permanent *Log archives, never from
 * Breeding/Litter: those rows are recycled by the doe's next kindling, so her
 * "whole history" taken from them would be her current cycle and nothing else.
 */
export async function getWeakDoesReport(): Promise<WeakDoesReport> {
  const [doeRows, matings, kindlings, weanings] = await Promise.all([
    // The same population the does board and the cull tile show: tagged and
    // active. A نافقة or مستبعدة doe cannot be culled, and an untagged one is a
    // سلالة who has not started.
    prisma.rabbit.findMany({
      where: { sex: "doe", tagId: { not: null }, status: "active" },
      select: { id: true, tagId: true, breed: true },
      orderBy: { tagId: "asc" },
    }),
    prisma.matingLog.groupBy({ by: ["doeId"], _count: { _all: true } }),
    // Count and «عدد الخلفة» in one pass — the birth count, frozen at kindling,
    // so moving kits between does never changes whose litter size this is.
    prisma.kindlingLog.groupBy({
      by: ["doeId"],
      _count: { _all: true },
      _sum: { bornAliveAtKindling: true },
    }),
    // Only cycles she actually finished: a weaning row with no count typed in
    // is an unanswered question, not a doe who weaned nothing.
    prisma.weaningLog.groupBy({
      by: ["doeId"],
      where: { weaned: { not: null } },
      _count: { _all: true },
      _sum: { weaned: true, bornAlive: true },
    }),
  ]);

  const matingsByDoe = new Map(matings.map((g) => [g.doeId, g._count._all]));
  const kindlingsByDoe = new Map(kindlings.map((g) => [g.doeId, g]));
  const weaningsByDoe = new Map(weanings.map((g) => [g.doeId, g]));

  return findWeakDoes(
    doeRows.map((d) => {
      const k = kindlingsByDoe.get(d.id);
      const w = weaningsByDoe.get(d.id);
      return {
        id: d.id,
        tagId: d.tagId,
        breed: d.breed,
        matings: matingsByDoe.get(d.id) ?? 0,
        kindlings: k?._count._all ?? 0,
        bornAliveTotal: k?._sum.bornAliveAtKindling ?? 0,
        weaningCycles: w?._count._all ?? 0,
        nursedTotal: w?._sum.bornAlive ?? 0,
        weanedTotal: w?._sum.weaned ?? 0,
      };
    })
  );
}
