import "server-only";
import { prisma } from "@/lib/prisma";
import { computeBreedingAverages, type BreedingAverages } from "@/lib/breeding-averages";

/**
 * السلالات split by how long they have been IN السلالات, not by weight.
 * Weight bracketing was removed because it can only ever report zeros on a
 * farm that doesn't weigh individually: the bracket counters were bumped from
 * the rabbit's latest WeightRecord, and replacement stock is raised in group
 * cages with no per-animal weighing — 0 of the 41 سلالات on the real farm had
 * a single weight row, so all six printed cells were structurally 0 forever.
 * Time-in-stock needs no husbandry work at all: it falls out of dates the app
 * already records, and it answers the question the weight split was standing
 * in for anyway ("which of these are old enough to select for breeding").
 */
export type AgeBracket = {
  under1m: number;
  m1to2: number;
  m2to3: number;
  over3m: number;
  total: number;
};

export type FollowUpReport = {
  from: Date;
  to: Date;
  herd: {
    does: number;
    bucks: number;
  };
  stock: {
    males: AgeBracket;
    females: AgeBracket;
  };
  deaths: {
    newborn: number | null; // نتاج — no per-event date on Litter.bornDead, not derivable
    weanedStock: number; // فطام — KitStockMovement(type: death) in range
    total: number | null; // null when any component is unknown
    stock: number; // نافق السلالة — tagId-less Rabbit rows marked deceased in range
    does: number; // نافق الأمهات
    bucks: number; // نافق الذكور
    culledExcluded: number | null; // نافق استبعادات — ambiguous, not derivable
  };
  culls: number; // الاستبعادات
  weaning: {
    totalWeaned: number;
    sold: number;
    retained: number;
    remainingStock: number; // running balance as of `to`, not bounded by `from`
  };
  health: {
    mangeStock: null;
    mangeDoes: null;
    mangeBucks: null;
    uterineInfection: null;
    mastitis: null;
  };
  breeding: {
    matings: number;
    pregnancyPositive: number;
    kindlings: number;
  };
  averages: BreedingAverages;
};

/** A "month" here is 30 days — calendar months would make the buckets uneven. */
const DAY_MS = 86_400_000;
const MONTH_DAYS = 30;

export type StockRabbitForAge = {
  sex: string;
  acquiredDate: Date | null;
  createdAt: Date;
  kitStockMovement: { date: Date; type: string } | null;
};

/**
 * The moment this rabbit entered السلالات. Three sources, most truthful first:
 *
 *  1. Its "retained" KitStockMovement — the literal press that moved the kit
 *     out of رصيد الفطام and into السلالات (1:1 via KitStockMovement.rabbitId).
 *  2. acquiredDate — for stock bought in rather than bred, which never passes
 *     through the weaning ledger at all.
 *  3. createdAt — last resort so a row can never fall out of the report.
 *
 * The fallbacks are not theoretical: on the real farm 0 of 41 سلالات had a
 * retained movement (they were all entered as مقتنى) while 41 of 41 had an
 * acquiredDate, so (2) is what actually carries the existing herd and (1) is
 * what will carry everything retained from الفطام going forward.
 */
function enteredStockAt(r: StockRabbitForAge): Date {
  if (r.kitStockMovement?.type === "retained") return r.kitStockMovement.date;
  return r.acquiredDate ?? r.createdAt;
}

/**
 * Buckets by time in السلالات as of `asOf`. A rabbit whose entry date is in the
 * future (back-dated data entry, or acquiring stock ahead of the report's end
 * date) lands in under1m rather than going negative into nothing.
 */
function bucketByStockAge(rabbits: StockRabbitForAge[], sex: string, asOf: Date): AgeBracket {
  const bracket: AgeBracket = { under1m: 0, m1to2: 0, m2to3: 0, over3m: 0, total: 0 };
  for (const r of rabbits) {
    if (r.sex !== sex) continue;
    bracket.total++;
    const days = Math.floor((asOf.getTime() - enteredStockAt(r).getTime()) / DAY_MS);
    if (days < MONTH_DAYS) bracket.under1m++;
    else if (days < MONTH_DAYS * 2) bracket.m1to2++;
    else if (days < MONTH_DAYS * 3) bracket.m2to3++;
    else bracket.over3m++;
  }
  return bracket;
}

/** Weaned-stock ledger balance as of (exclusive) a point in time (running total, not period-bound). */
async function getKitStockBalanceAsOf(to: Date): Promise<number> {
  const [weanings, movements] = await Promise.all([
    // WeaningLog, not Litter — the Litter row is recycled by the next kindling,
    // so counting it made this balance drop past weanings. See getKitStockSummary.
    prisma.weaningLog.findMany({
      where: { weaningDate: { lt: to }, weaned: { not: null } },
      select: { weaned: true },
    }),
    prisma.kitStockMovement.findMany({
      where: { date: { lt: to } },
      select: { type: true, count: true },
    }),
  ]);
  const totalWeaned = weanings.reduce((s, l) => s + (l.weaned ?? 0), 0);
  const totalSold = movements.filter((m) => m.type === "sale").reduce((s, m) => s + m.count, 0);
  const totalDied = movements.filter((m) => m.type === "death").reduce((s, m) => s + m.count, 0);
  const totalRetained = movements
    .filter((m) => m.type === "retained")
    .reduce((s, m) => s + m.count, 0);
  // Deleted سلالات going back to the weaning cages — see getKitStockSummary.
  const totalReturned = movements
    .filter((m) => m.type === "returned")
    .reduce((s, m) => s + m.count, 0);
  // Signed manual corrections. This used to be left out, which made the رصيد
  // printed on the follow-up report disagree with /weaning-sales by exactly
  // the adjustments — same formula as getKitStockSummary now, just as-of `to`.
  const totalAdjustment = movements
    .filter((m) => m.type === "adjustment")
    .reduce((s, m) => s + m.count, 0);
  return totalWeaned - totalSold - totalDied - totalRetained + totalReturned + totalAdjustment;
}

/**
 * Data for the "تقرير المتابعة" weekly follow-up report. `to` is the EXCLUSIVE
 * upper bound (start of the day after the selected end date) — callers should
 * pass the day after the last day they want included. Herd/stock counts are a
 * current snapshot (no historical point-in-time headcount exists); death,
 * sale, weaning, and breeding-event counts are bounded to [from, to). Fields
 * with no tracking anywhere in the app (mange, uterine infection, mastitis,
 * per-event newborn-kit death dates) are returned as null and must render "—".
 */
export async function getFollowUpReport(from: Date, to: Date): Promise<FollowUpReport> {
  const dateRange = { gte: from, lt: to };

  const [
    does,
    bucks,
    stockRabbits,
    weanedStockDeathAgg,
    stockDeaths,
    doeDeaths,
    buckDeaths,
    culls,
    weaningsInRange,
    soldAgg,
    retainedAgg,
    remainingStock,
    matings,
    pregnancyPositive,
    kindlingRows,
  ] = await Promise.all([
    prisma.rabbit.count({ where: { sex: "doe", tagId: { not: null }, status: "active" } }),
    prisma.rabbit.count({ where: { sex: "buck", tagId: { not: null }, status: "active" } }),
    prisma.rabbit.findMany({
      where: { tagId: null, status: "active" },
      select: {
        sex: true,
        acquiredDate: true,
        createdAt: true,
        // The retention press that created this سلالة, when there was one.
        kitStockMovement: { select: { date: true, type: true } },
      },
    }),
    prisma.kitStockMovement.aggregate({
      where: { type: "death", date: dateRange },
      _sum: { count: true },
    }),
    prisma.rabbit.count({
      where: { tagId: null, status: "deceased", updatedAt: dateRange },
    }),
    prisma.rabbit.count({
      where: { sex: "doe", tagId: { not: null }, status: "deceased", updatedAt: dateRange },
    }),
    prisma.rabbit.count({
      where: { sex: "buck", tagId: { not: null }, status: "deceased", updatedAt: dateRange },
    }),
    prisma.rabbit.count({ where: { status: "culled", updatedAt: dateRange } }),
    // WeaningLog, not Litter — same reason as getKitStockBalanceAsOf: a doe who
    // kindled again since would have dropped her weaning out of the period.
    // Rows, not an aggregate: the averages divide by the number of weaning
    // events, so their denominator is just this array's length.
    prisma.weaningLog.findMany({
      where: { weaningDate: dateRange, weaned: { not: null } },
      select: { weaned: true },
    }),
    prisma.kitStockMovement.aggregate({
      where: { type: "sale", date: dateRange },
      _sum: { count: true },
    }),
    prisma.kitStockMovement.aggregate({
      where: { type: "retained", date: dateRange },
      _sum: { count: true },
    }),
    getKitStockBalanceAsOf(to),
    prisma.breeding.count({ where: { matingDate: dateRange } }),
    prisma.pregnancyTestLog.count({ where: { result: "positive", testDate: dateRange } }),
    // findMany, not count: the averages need the per-litter counts anyway, and
    // `kindlings` below is just this array's length — so this stays one round
    // trip rather than two.
    prisma.kindlingLog.findMany({
      where: { kindlingDate: dateRange },
      select: {
        bornAliveAtKindling: true,
        bornDead: true,
        bornDeadAtKindling: true,
      },
    }),
  ]);

  const weanedStockDeaths = weanedStockDeathAgg._sum.count ?? 0;
  const totalWeaned = weaningsInRange.reduce((s, l) => s + (l.weaned ?? 0), 0);

  return {
    from,
    to,
    herd: { does, bucks },
    stock: {
      // Measured from now, not from `to`: like the herd headcounts above, this
      // is a current snapshot — the query has no date filter, so ageing the
      // rows against the period end would mix a live population with a
      // historical clock and report stock as younger than it is.
      males: bucketByStockAge(stockRabbits, "buck", new Date()),
      females: bucketByStockAge(stockRabbits, "doe", new Date()),
    },
    deaths: {
      newborn: null,
      weanedStock: weanedStockDeaths,
      total: null,
      stock: stockDeaths,
      does: doeDeaths,
      bucks: buckDeaths,
      culledExcluded: null,
    },
    culls,
    weaning: {
      totalWeaned,
      sold: soldAgg._sum.count ?? 0,
      retained: retainedAgg._sum.count ?? 0,
      remainingStock,
    },
    health: {
      mangeStock: null,
      mangeDoes: null,
      mangeBucks: null,
      uterineInfection: null,
      mastitis: null,
    },
    breeding: { matings, pregnancyPositive, kindlings: kindlingRows.length },
    averages: computeBreedingAverages(
      kindlingRows,
      weaningsInRange,
      weanedStockDeaths,
      remainingStock
    ),
  };
}
