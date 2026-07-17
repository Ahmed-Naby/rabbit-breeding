import "server-only";
import { prisma } from "@/lib/prisma";

export type WeightBracket = { heavy: number; medium: number; light: number; total: number };

export type FollowUpReport = {
  from: Date;
  to: Date;
  herd: {
    does: number;
    bucks: number;
  };
  stock: {
    males: WeightBracket;
    females: WeightBracket;
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
};

const HEAVY_G = 2250;
const MEDIUM_G = 2000;

function bucketWeights(
  rabbits: { sex: string; weightRecords: { weightGrams: number }[] }[],
  sex: string
): WeightBracket {
  const bracket: WeightBracket = { heavy: 0, medium: 0, light: 0, total: 0 };
  for (const r of rabbits) {
    if (r.sex !== sex) continue;
    bracket.total++;
    const w = r.weightRecords[0]?.weightGrams;
    if (w == null) continue;
    if (w >= HEAVY_G) bracket.heavy++;
    else if (w >= MEDIUM_G) bracket.medium++;
    else bracket.light++;
  }
  return bracket;
}

/** Weaned-stock ledger balance as of (exclusive) a point in time (running total, not period-bound). */
async function getKitStockBalanceAsOf(to: Date): Promise<number> {
  const [weanedLitters, movements] = await Promise.all([
    prisma.litter.findMany({
      where: { weaningDate: { not: null, lt: to }, weaned: { not: null } },
      select: { weaned: true },
    }),
    prisma.kitStockMovement.findMany({
      where: { date: { lt: to } },
      select: { type: true, count: true },
    }),
  ]);
  const totalWeaned = weanedLitters.reduce((s, l) => s + (l.weaned ?? 0), 0);
  const totalSold = movements.filter((m) => m.type === "sale").reduce((s, m) => s + m.count, 0);
  const totalDied = movements.filter((m) => m.type === "death").reduce((s, m) => s + m.count, 0);
  const totalRetained = movements
    .filter((m) => m.type === "retained")
    .reduce((s, m) => s + m.count, 0);
  return totalWeaned - totalSold - totalDied - totalRetained;
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
    weanedLittersInRange,
    soldAgg,
    retainedAgg,
    remainingStock,
    matings,
    pregnancyPositive,
    kindlings,
  ] = await Promise.all([
    prisma.rabbit.count({ where: { sex: "doe", tagId: { not: null }, status: "active" } }),
    prisma.rabbit.count({ where: { sex: "buck", tagId: { not: null }, status: "active" } }),
    prisma.rabbit.findMany({
      where: { tagId: null, status: "active" },
      select: {
        sex: true,
        weightRecords: { orderBy: { date: "desc" }, take: 1, select: { weightGrams: true } },
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
    prisma.litter.findMany({
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
    prisma.kindlingLog.count({ where: { kindlingDate: dateRange } }),
  ]);

  const weanedStockDeaths = weanedStockDeathAgg._sum.count ?? 0;
  const totalWeaned = weanedLittersInRange.reduce((s, l) => s + (l.weaned ?? 0), 0);

  return {
    from,
    to,
    herd: { does, bucks },
    stock: {
      males: bucketWeights(stockRabbits, "buck"),
      females: bucketWeights(stockRabbits, "doe"),
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
    breeding: { matings, pregnancyPositive, kindlings },
  };
}
