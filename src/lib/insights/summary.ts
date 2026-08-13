import "server-only";
import { getSettings } from "@/lib/settings";
import { getFollowUpReport } from "@/app/reports/report-data";
import {
  getHerdReport,
  getIdleDoesReport,
  getTopDoesReport,
  getWeakDoesReport,
} from "@/app/reports/herd-data";
import { revenuePerDoeCents } from "@/lib/breeding-averages";

/**
 * The farm, compressed to the few hundred numbers a reader would actually need
 * to advise it — the payload behind «تحليل ذكي للأداء».
 *
 * Deliberately NOT the raw records. A farm with a couple of thousand kindlings
 * would cost a fortune to send whole, would take a minute to serialise, and
 * would bury the signal it is being sent to find. Every figure here is one the
 * reports page already computes and the farmer already reads, so the advice can
 * be checked against a screen he knows rather than against a black box.
 *
 * It is also the ONLY thing the model ever sees: the recommendation validator
 * refuses any recommendation citing a metric that is not a key of this object,
 * which is what stops an invented number from being printed as if the farm's
 * own books produced it.
 */
export type FarmSummary = {
  generatedAt: string;
  /** The period every "window" figure below is bounded to. Lifetime ones say so. */
  windowDays: number;
  currency: string;

  /**
   * When in the year the farm is being read.
   *
   * The app measures no temperature and this does not pretend to: it is the
   * calendar, nothing more. But heat is the largest uncontrolled variable in an
   * Egyptian barn — a buck that spent August above 30°C breeds badly for weeks
   * afterwards — and without knowing the month, a reader looking at a collapsed
   * conception rate has no way to even raise the possibility. It is offered as
   * a season, and the advice must treat it as one.
   */
  context: {
    /** 1–12. */
    month: number;
    monthName: string;
    /** May–September, the stretch an Egyptian barn runs hot enough to cost fertility. */
    hotSeason: boolean;
  };

  herd: {
    does: number;
    bucks: number;
    stockMales: number;
    stockFemales: number;
    /** Replacement stock old enough to breed from — the ones over 3 months. */
    stockReadyToBreed: number;
  };

  /** Everything that happened inside the window. */
  window: {
    matings: number;
    pregnancyPositive: number;
    kindlings: number;
    weaned: number;
    sold: number;
    retained: number;
    nursingDeaths: number;
    weanedStockDeaths: number;
    doeDeaths: number;
    buckDeaths: number;
    stockDeaths: number;
    culls: number;
    /** Positives ÷ matings, the window's conception rate. */
    conceptionRatePct: number | null;
  };

  /** The farm's whole record, not the window — see computeBreedingAverages. */
  lifetime: {
    bornAlivePerLitter: number | null;
    nursingDeathsPerLitter: number | null;
    weanedPerLitter: number | null;
    littersPerDoePerYear: number | null;
    soldPerWeaning: number | null;
    soldPerDoePerMonth: number | null;
    kgSoldPerDoePerMonth: number | null;
    revenuePerDoePerMonth: number | null;
    /** رصيد الفطام standing in the cages right now. */
    currentWeanedStock: number;
  };

  /** «إنتاجية القطيع» — the same production, divided by every doe in the barn. */
  productivity: {
    targetCyclesPerYear: number;
    cyclesPerDoePerYear: number | null;
    cycleAchievementPct: number | null;
    weanedPerDoePerMonth: number | null;
    soldPerDoePerYear: number | null;
    kgSold: number;
    realizedPricePerKg: number | null;
    breakEvenPricePerKg: number | null;
    marginPerKg: number | null;
    feedKgConsumed: number | null;
    feedConversionRatio: number | null;
    income: number;
    expense: number;
    net: number;
  };

  does: {
    scoredAgainstLitterSize: number | null;
    weakCount: number;
    weakSharePct: number | null;
    lowestScore: number | null;
    bestScore: number | null;
    herdAvgScore: number | null;
    idleCount: number;
    idleSharePct: number | null;
    /** How long a doe may go without kindling before she is behind schedule. */
    cycleDays: number;
    cullCandidates: number;
    cullBucks: number;
  };

  /** Names, so the advice can be acted on this morning rather than admired. */
  weakDoes: {
    tagId: string | null;
    matings: number;
    kindlings: number;
    fertilityRatePct: number | null;
    avgLitterSize: number | null;
    score: number | null;
    reasons: string[];
  }[];
  bestDoes: {
    tagId: string | null;
    kindlings: number;
    fertilityRatePct: number;
    avgLitterSize: number;
    score: number;
  }[];
  idleDoes: {
    tagId: string | null;
    idleDays: number;
    neverKindled: boolean;
  }[];

  settings: {
    pricePerKg: number;
    feedPricePerTon: number;
    rebreedAfterKindlingDays: number;
    gestationDays: number;
  };
};

const DAY_MS = 86_400_000;

const MONTH_NAMES = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];
/** Inclusive month numbers — May through September. */
const HOT_SEASON = { from: 5, to: 9 };

/** Long enough for a rebreed cycle and a sale run to both show up in it. */
export const INSIGHTS_WINDOW_DAYS = 90;
/** Enough names to act on, few enough to keep the payload a summary. */
const NAMED_DOE_LIMIT = 10;
const NAMED_BEST_LIMIT = 5;

/** Cents to whole currency, because "١٤٢٫٥ جنيه" reads and "14250" does not. */
function money(cents: number | null): number | null {
  return cents == null ? null : round(cents / 100);
}

/** Two decimals is more precision than any husbandry decision needs. */
function round(n: number | null): number | null {
  return n == null ? null : Math.round(n * 100) / 100;
}

function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : round((part / whole) * 100);
}

/**
 * Reads the farm and folds it into one object.
 *
 * Must run inside runWithFarm — every query below goes through the tenant
 * client, so calling it outside the AsyncLocalStorage scope would either throw
 * or, far worse, read the wrong farm.
 */
export async function buildFarmSummary(now = new Date()): Promise<FarmSummary> {
  // `to` is the EXCLUSIVE upper bound both report readers expect: the start of
  // tomorrow, so everything entered today is inside the window.
  const to = new Date(now.getTime() + DAY_MS);
  const from = new Date(now.getTime() - INSIGHTS_WINDOW_DAYS * DAY_MS);

  const [settings, followUp, herd, weak, top, idle] = await Promise.all([
    getSettings(),
    getFollowUpReport(from, to),
    getHerdReport(from, to),
    getWeakDoesReport(),
    getTopDoesReport(),
    getIdleDoesReport(),
  ]);

  const p = herd.productivity;
  const a = followUp.averages;
  const month = now.getUTCMonth() + 1;

  return {
    generatedAt: now.toISOString(),
    windowDays: INSIGHTS_WINDOW_DAYS,
    currency: settings.currency,

    context: {
      month,
      monthName: MONTH_NAMES[month - 1],
      hotSeason: month >= HOT_SEASON.from && month <= HOT_SEASON.to,
    },

    herd: {
      does: followUp.herd.does,
      bucks: followUp.herd.bucks,
      stockMales: followUp.stock.males.total,
      stockFemales: followUp.stock.females.total,
      stockReadyToBreed: followUp.stock.males.over3m + followUp.stock.females.over3m,
    },

    window: {
      matings: followUp.breeding.matings,
      pregnancyPositive: followUp.breeding.pregnancyPositive,
      kindlings: followUp.breeding.kindlings,
      weaned: followUp.weaning.totalWeaned,
      sold: followUp.weaning.sold,
      retained: followUp.weaning.retained,
      nursingDeaths: followUp.deaths.newborn ?? 0,
      weanedStockDeaths: followUp.deaths.weanedStock,
      doeDeaths: followUp.deaths.does,
      buckDeaths: followUp.deaths.bucks,
      stockDeaths: followUp.deaths.stock,
      culls: followUp.culls,
      conceptionRatePct: pct(followUp.breeding.pregnancyPositive, followUp.breeding.matings),
    },

    lifetime: {
      bornAlivePerLitter: round(a.bornAlive),
      nursingDeathsPerLitter: round(a.nursingDeaths),
      weanedPerLitter: round(a.weaned),
      littersPerDoePerYear: round(followUp.littersPerDoeYear.perYear),
      soldPerWeaning: round(followUp.soldPerWeaning.perWeaning),
      soldPerDoePerMonth: round(followUp.salesPerDoe.perDoe),
      kgSoldPerDoePerMonth: round(
        followUp.weightPerDoe.perDoeGrams == null ? null : followUp.weightPerDoe.perDoeGrams / 1000
      ),
      revenuePerDoePerMonth: money(
        revenuePerDoeCents(followUp.weightPerDoe.perDoeGrams, followUp.pricing.pricePerKgCents)
      ),
      currentWeanedStock: followUp.weaning.currentStock,
    },

    productivity: {
      targetCyclesPerYear: p.targetCyclesPerYear,
      cyclesPerDoePerYear: round(p.cyclesPerDoePerYear),
      cycleAchievementPct: p.cycleAchievement == null ? null : round(p.cycleAchievement * 100),
      weanedPerDoePerMonth: round(p.weanedPerDoePerMonth),
      soldPerDoePerYear: round(p.soldPerDoePerYear),
      kgSold: round(p.kgSold) ?? 0,
      realizedPricePerKg: money(p.realizedPricePerKgCents),
      breakEvenPricePerKg: money(p.breakEvenPricePerKgCents),
      marginPerKg: money(p.marginPerKgCents),
      feedKgConsumed: round(p.feedKgConsumed),
      feedConversionRatio: round(p.feedConversionRatio),
      income: money(p.incomeCents) ?? 0,
      expense: money(p.expenseCents) ?? 0,
      net: money(p.netCents) ?? 0,
    },

    does: {
      scoredAgainstLitterSize: round(weak.herdAvgLitterSize),
      weakCount: weak.weakDoes.length,
      weakSharePct: pct(weak.weakDoes.length, weak.doeCount),
      lowestScore: round(weak.lowestScore),
      bestScore: round(top.topDoes[0]?.score ?? null),
      herdAvgScore: round(top.herdAvgScore),
      idleCount: idle.idleDoes.length,
      idleSharePct: pct(idle.idleDoes.length, idle.doeCount),
      cycleDays: idle.cycleDays,
      cullCandidates: followUp.cullCandidates,
      cullBucks: followUp.cullBucks,
    },

    // The lists arrive already ordered worst-first / best-first / longest-idle
    // first, so the cut is simply the head of each.
    weakDoes: weak.weakDoes.slice(0, NAMED_DOE_LIMIT).map((d) => ({
      tagId: d.tagId,
      matings: d.matings,
      kindlings: d.kindlings,
      fertilityRatePct: round(d.fertilityRatePct),
      avgLitterSize: round(d.avgLitterSize),
      score: round(d.score),
      reasons: d.reasons,
    })),
    bestDoes: top.topDoes.slice(0, NAMED_BEST_LIMIT).map((d) => ({
      tagId: d.tagId,
      kindlings: d.kindlings,
      fertilityRatePct: round(d.fertilityRatePct) ?? 0,
      avgLitterSize: round(d.avgLitterSize) ?? 0,
      score: round(d.score) ?? 0,
    })),
    idleDoes: idle.idleDoes.slice(0, NAMED_DOE_LIMIT).map((d) => ({
      tagId: d.tagId,
      idleDays: d.idleDays,
      neverKindled: d.neverKindled,
    })),

    settings: {
      pricePerKg: money(settings.defaultPricePerKgCents) ?? 0,
      feedPricePerTon: money(settings.feedPricePerTonCents) ?? 0,
      rebreedAfterKindlingDays: settings.rebreedAfterKindlingDays,
      gestationDays: settings.gestationDays,
    },
  };
}
