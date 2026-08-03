import "server-only";
import { prisma } from "@/lib/prisma";
import {
  computeBreedingAverages,
  computeMonthlySales,
  type BreedingAverages,
  type MonthlySales,
} from "@/lib/breeding-averages";
import {
  buildKitStockSeries,
  movementDelta,
  type KitStockBucket,
  type KitStockPoint,
} from "@/lib/kit-stock-series";

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
  /** Lifetime, unlike every field above it — see computeBreedingAverages. */
  averages: BreedingAverages;
  /** متوسط البيع الشهري, also lifetime — see computeMonthlySales. */
  monthlySales: MonthlySales;
  /** The رصيد الفطام curve since the farm started; also lifetime. */
  kitStockHistory: { points: KitStockPoint[]; bucket: KitStockBucket };
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

/**
 * Weaned-stock ledger balance as of (exclusive) a point in time (running total,
 * not period-bound). Omit `to` for the balance right now, with no upper bound at
 * all — that is what «متوسط رصيد الفطام» divides, and it must ignore the report's
 * date filter.
 */
async function getKitStockBalanceAsOf(to?: Date): Promise<number> {
  const upTo = to ? { lt: to } : undefined;
  const [weanings, movements] = await Promise.all([
    // WeaningLog, not Litter — the Litter row is recycled by the next kindling,
    // so counting it made this balance drop past weanings. See getKitStockSummary.
    prisma.weaningLog.findMany({
      where: { weaningDate: upTo, weaned: { not: null } },
      select: { weaned: true },
    }),
    prisma.kitStockMovement.findMany({
      where: { date: upTo },
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
 * sale, weaning, and breeding-event counts are bounded to [from, to), while
 * `averages` is lifetime and ignores both bounds. Fields with no tracking
 * anywhere in the app (mange, uterine infection, mastitis, per-event
 * newborn-kit death dates) are returned as null and must render "—".
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
    lifetimeRemainingStock,
    matings,
    pregnancyPositive,
    kindlingRows,
    lifetimeKindlingRows,
    lifetimeWeanings,
    lifetimeWeanedStockDeathAgg,
    historyWeanings,
    historyMovements,
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
    // Dying retires the number: setRabbitStatusOp clears tagId and parks it in
    // retiredTagId, so "was this a tagged mother/buck" cannot be asked of tagId
    // alone — `tagId != null AND deceased` matches nothing the app can produce,
    // which put every dead doe and buck in the untagged سلالات bucket and left
    // «نافق الأمهات» and «نافق الذكور» permanently at zero. /mortality already
    // reads it this way (see its own note); this is the same test.
    prisma.rabbit.count({
      where: { tagId: null, retiredTagId: null, status: "deceased", updatedAt: dateRange },
    }),
    prisma.rabbit.count({
      where: {
        sex: "doe",
        status: "deceased",
        updatedAt: dateRange,
        OR: [{ tagId: { not: null } }, { retiredTagId: { not: null } }],
      },
    }),
    prisma.rabbit.count({
      where: {
        sex: "buck",
        status: "deceased",
        updatedAt: dateRange,
        OR: [{ tagId: { not: null } }, { retiredTagId: { not: null } }],
      },
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
    // «رصيد الفطام المتاح للبيع» on the averages card: the farm's balance right
    // now, unfiltered on purpose — see computeBreedingAverages.
    getKitStockBalanceAsOf(),
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
    // «متوسطات الأداء» is a lifetime board — the date filter above drives the
    // period sections, but the averages describe the farm since it started, so
    // a one-week window can no longer empty them out into «—».
    prisma.kindlingLog.findMany({
      select: {
        bornAliveAtKindling: true,
        bornDead: true,
        bornDeadAtKindling: true,
      },
    }),
    prisma.weaningLog.findMany({
      where: { weaned: { not: null } },
      select: { weaned: true },
    }),
    prisma.kitStockMovement.aggregate({ where: { type: "death" }, _sum: { count: true } }),
    // Dated rows for the balance curve. Same two tables and the same signs as
    // getKitStockBalanceAsOf, replayed in order instead of summed once.
    prisma.weaningLog.findMany({
      where: { weaned: { not: null } },
      select: { weaningDate: true, weaned: true },
    }),
    prisma.kitStockMovement.findMany({ select: { date: true, type: true, count: true } }),
  ]);

  const weanedStockDeaths = weanedStockDeathAgg._sum.count ?? 0;
  const totalWeaned = weaningsInRange.reduce((s, l) => s + (l.weaned ?? 0), 0);

  // Every dated change to the weaned-stock balance, ever. The curve replays it
  // and متوسط البيع الشهري measures its sales against its own span, so both
  // read the same history and neither costs an extra query.
  const stockEvents = [
    ...historyWeanings.map((w) => ({ dateMs: w.weaningDate.getTime(), delta: w.weaned ?? 0 })),
    ...historyMovements.map((m) => ({ dateMs: m.date.getTime(), delta: movementDelta(m.type, m.count) })),
  ];
  const farmStartMs = stockEvents.length > 0 ? Math.min(...stockEvents.map((e) => e.dateMs)) : null;
  const lifetimeSold = historyMovements
    .filter((m) => m.type === "sale")
    .reduce((s, m) => s + m.count, 0);

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
    // Lifetime on every side — see the query note above.
    averages: computeBreedingAverages({
      kindlings: lifetimeKindlingRows,
      weanings: lifetimeWeanings,
      weanedStockDeaths: lifetimeWeanedStockDeathAgg._sum.count ?? 0,
      remainingStock: lifetimeRemainingStock,
      totalSold: lifetimeSold,
    }),
    monthlySales: computeMonthlySales(lifetimeSold, farmStartMs, Date.now()),
    kitStockHistory: buildKitStockSeries(stockEvents, Date.now()),
  };
}
