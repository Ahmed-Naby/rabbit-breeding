/**
 * «إنتاجية القطيع» — the same production numbers as the follow-up report's
 * متوسطات الأداء, but divided by the WHOLE herd of does instead of by the
 * events that happened.
 *
 * The distinction is the entire point of this module, and it is a change of
 * denominator, not of numerator:
 *
 *   breeding-averages.ts   ÷ عدد الولادات / عدد مرات الفطام في الفترة
 *                            → "how good is a doe that produces?" (جودة الأم)
 *   this module            ÷ عدد الأمهات في العنبر
 *                            → "how much does a doe in this farm produce?"
 *
 * A doe that completed no cycle at all is invisible to the first and drags the
 * second down — which is correct, because she still eats, still occupies a
 * cage, and still counts in عدد الأمهات. That gap between the two sets of
 * numbers IS the cost of the idle does, and making it a printed figure rather
 * than a feeling is what this report is for.
 *
 * Framework-agnostic (no Prisma, no server-only) for the same reason as
 * breeding-averages.ts: the web passes Prisma rows and mobile would pass local
 * SQLite rows, and the two must never disagree on what these mean.
 */

import { rebreedSystemBand, type RebreedSystemBand } from "./does-board";
import {
  doeDaysIn,
  doesPresentOn,
  startOfRunningMonth,
  YEAR_DAYS,
  type DoePresence,
} from "./breeding-averages";

/** A dated amount to be averaged month by month — head, grams, or cents. */
export type DatedValue = { dateMs: number; value: number };

/** Kindling fields needed here; every KindlingLog row on both platforms has them. */
export type HerdKindlingRow = {
  /** When she kindled — the cycles rate counts only litters inside its window. */
  dateMs: number;
};

export type HerdProductivityInput = {
  /** THE denominator: tagged, active does currently in the herd. */
  doeCount: number;
  /** Length of the selected period in days, used to annualise the yearly rates. */
  periodDays: number;
  /** Every doe's stay on the farm — the denominators for «العائد الشهري لكل أم». */
  does: DoePresence[];
  /** The period, clamped exactly as periodDays is. `toMs` is EXCLUSIVE. */
  fromMs: number;
  toMs: number;
  /** Weanings in range, dated, for the monthly mean. `value` is head weaned. */
  weaningEvents: DatedValue[];
  /** Sales in range, dated: head anchors the window, grams feed the mean. */
  saleEvents: { dateMs: number; count: number; grams: number }[];
  /** Transactions in range, dated, in cents. */
  incomeEvents: DatedValue[];
  expenseEvents: DatedValue[];
  /** One full reproductive cycle in days — see rebreedTarget. */
  cycleDays: number;
  /** Cycles a year the configured system promises — see rebreedTarget. */
  targetCyclesPerYear: number;
  kindlings: HerdKindlingRow[];
  /** Weaning rows in range, already filtered to `weaned IS NOT NULL` by the caller. */
  weanings: { weaned: number | null }[];
  /** KitStockMovement(type: "sale") in range. */
  soldCount: number;
  soldWeightGrams: number;
  /** Transaction totals in range, farm-wide. */
  incomeCents: number;
  expenseCents: number;
  /** KitStockMovement(type: "sale") money in range — the meat revenue alone. */
  soldAmountCents: number;
  /** Transaction(category: "feed") in range, needed to weigh the feed bill. */
  feedExpenseCents: number;
  /** Settings.feedPricePerTonCents — turns that bill back into kilograms. */
  feedPricePerTonCents: number;
};

export type HerdProductivity = {
  doeCount: number;
  periodDays: number;
  kindlings: number;
  weanings: number;
  /** What the configured rebreed system promises — see rebreedTarget. */
  targetCyclesPerYear: number;
  /** What the herd actually achieved, annualised from the selected period. */
  cyclesPerDoePerYear: number | null;
  /** The doe-years cyclesPerDoePerYear divided by — see doeDaysIn. */
  doeYears: number | null;
  /** Whether the running month was dropped off the tail of the cycles window. */
  cyclesExcludeRunningMonth: boolean;
  /** الفجوة: actual ÷ target, 0–1+. null when either side is unknown. */
  cycleAchievement: number | null;

  weanedPerDoePerMonth: number | null;
  kgSoldPerDoePerMonth: number | null;
  revenuePerDoePerMonthCents: number | null;
  costPerDoePerMonthCents: number | null;
  netPerDoePerMonthCents: number | null;

  incomeCents: number;
  expenseCents: number;
  /** income − expense over the whole period. Negative is a real loss, not a rounding. */
  netCents: number;
  soldCount: number;
  /**
   * Rabbits sold per doe per year, annualised from the period. The governing
   * number of a meat farm: at a break-even within a few pounds of the sale
   * price — which is where 19,000/ton feed puts every Egyptian farm — the price
   * cannot be argued with, but this can. Two extra kits per doe per year is
   * worth more than a five-pound rise in the price of a kilo.
   */
  soldPerDoePerYear: number | null;

  /** Kilograms of meat sold in the period — the denominator for everything below. */
  kgSold: number;
  /** What a kilo actually fetched: meat revenue ÷ kg sold. */
  realizedPricePerKgCents: number | null;
  /** The price a kilo must fetch for the farm to come out level — see below. */
  breakEvenPricePerKgCents: number | null;
  /** realized − break-even. Negative means every kilo sold deepened the hole. */
  marginPerKgCents: number | null;
  /** Feed bought in the period, in kg, inferred from the bill and the ton price. */
  feedKgConsumed: number | null;
  /** kg of feed per kg of meat sold — the farm's real whole-herd conversion. */
  feedConversionRatio: number | null;
};

/**
 * Cycles a year each husbandry system averages — the figure printed on the
 * badge beside مدة إعادة التلقيح in الإعدادات, so the farm reads its target off
 * the settings page before any report is opened.
 *
 * Keyed by band rather than by exact offset because the setting is a free
 * number: a farm typing 12 is running نصف مكثف and gets نصف مكثف's target, the
 * same as one typing 10.
 *
 * Deliberately NOT derived as 365 ÷ (gestationDays + rebreedAfterKindlingDays).
 * That arithmetic gives 12.2 for مكثف on a 30-day gestation, because it assumes
 * a doe conceives on the very day she is presented, every time, forever — and
 * it is not even monotonic against the setting once the offset is free, so
 * resting does *longer* would raise the bar. These averages carry the practical
 * slack for missed services and repeat matings, so they are the honest bar.
 */
export const REBREED_BAND_TARGET_CYCLES: Record<RebreedSystemBand, number> = {
  intensive: 11, // مكثف — 0 إلى 5 أيام بعد الولادة
  semiIntensive: 9, // نصف مكثف — 6 إلى 15 يومًا
  natural: 7, // طبيعي — أكثر من 15 يومًا
};

export type RebreedTarget = {
  /** Cycles a year the configured system promises. */
  targetCyclesPerYear: number;
  /**
   * The matching cycle length in days, i.e. how long a doe may go without
   * kindling before she is behind schedule. Back-computed from the target so
   * the idle threshold and the target can never tell different stories.
   */
  cycleDays: number;
};

/**
 * The farm's own target, from its rebreed setting — whatever number of days it
 * typed, via the band that number falls in.
 */
export function rebreedTarget(rebreedAfterKindlingDays: number): RebreedTarget {
  const targetCyclesPerYear =
    REBREED_BAND_TARGET_CYCLES[rebreedSystemBand(rebreedAfterKindlingDays)];
  return {
    targetCyclesPerYear,
    cycleDays: Math.round(YEAR_DAYS / targetCyclesPerYear),
  };
}

const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0);

const monthOf = (ms: number) => {
  const d = new Date(ms);
  return d.getFullYear() * 12 + d.getMonth();
};
const startOfMonth = (month: number) =>
  new Date(Math.floor(month / 12), month % 12, 1).getTime();

const bucketByMonth = (values: DatedValue[]) => {
  const byMonth = new Map<number, number>();
  for (const v of values) {
    const m = monthOf(v.dateMs);
    byMonth.set(m, (byMonth.get(m) ?? 0) + v.value);
  }
  return byMonth;
};

/**
 * «لكل أم شهريًا» — the mean of (this month's total ÷ the does standing on the
 * 1st of it), the same rule computeSalesPerDoe uses on the follow-up report.
 *
 * It replaced `total ÷ today's doe count × 30/periodDays`, which divided every
 * month of a growing farm's history by the herd it happens to have today and
 * spread the total over days rather than months. On a farm that grew from 173
 * does to 218 the two answers were 4.82 and 5.69 kg for the same period, which
 * is not a rounding difference — it is a different question being answered.
 *
 * Three rules make the figure reproducible from the chart on the other tab:
 *
 *   - Only calendar months lying WHOLLY inside the period are scored. A month
 *     the filter cuts in half would put part of a month's output over a whole
 *     month's herd. The running month is excluded by the same test, since the
 *     period end is clamped to today.
 *   - Counting starts at the first month `anchor` is non-zero. The ramp-up
 *     before a farm's first sale is the wait for its first litter, not months
 *     it sold badly; scoring them 0 measures the wait.
 *   - A month with no does at all is skipped, not scored 0: there is nothing to
 *     divide by, which is not the same as having produced nothing.
 *
 * Returns null — never 0 — when no month qualifies, so a range shorter than one
 * calendar month renders «—» rather than a number nobody can reproduce.
 */
function meanPerDoePerMonth(
  values: DatedValue[],
  anchor: DatedValue[],
  does: DoePresence[],
  fromMs: number,
  toMs: number
): number | null {
  let first = monthOf(fromMs);
  if (startOfMonth(first) < fromMs) first += 1;
  // toMs is exclusive, so the month it falls in is never fully covered.
  const last = monthOf(toMs) - 1;

  const anchored = bucketByMonth(anchor);
  let start: number | null = null;
  for (let m = first; m <= last; m++) {
    if ((anchored.get(m) ?? 0) !== 0) {
      start = m;
      break;
    }
  }
  if (start == null) return null;

  const totals = bucketByMonth(values);
  const ratios: number[] = [];
  for (let m = start; m <= last; m++) {
    const present = doesPresentOn(does, startOfMonth(m));
    if (present === 0) continue;
    ratios.push((totals.get(m) ?? 0) / present);
  }
  return ratios.length > 0 ? sum(ratios) / ratios.length : null;
}

export function computeHerdProductivity(input: HerdProductivityInput): HerdProductivity {
  const { doeCount, periodDays, targetCyclesPerYear } = input;

  // The «العائد الشهري لكل أم» family, every one of them scored month by month
  // against that month's own herd — see meanPerDoePerMonth.
  const perMonth = (values: DatedValue[], anchor: DatedValue[]) =>
    meanPerDoePerMonth(values, anchor, input.does, input.fromMs, input.toMs);
  // Revenue, cost and net share one anchor so the three always cover exactly
  // the same months: a net that spanned different months than its two halves
  // would not be their difference.
  const moneyAnchor = [...input.incomeEvents, ...input.expenseEvents];

  // ÷ doe-YEARS standing, not ÷ does standing today — see doeDaysIn. The
  // annualisation is the division itself now: doe-days ÷ 365 is already "how
  // many does the farm kept for a full year", so no separate ×(365/period).
  //
  // The window stops at the start of the running month, for the reason
  // startOfRunningMonth gives — UNLESS the caller asked for a range that lies
  // wholly inside it, which is a deliberate "how is this month going" and must
  // answer with a number rather than «—». Everything else on this board keeps
  // the caller's own range; only this rate is clamped, and only at the tail.
  //
  // That clamp is also what makes this agree with «عدد البطون في السنة» on the
  // follow-up report: same doe-day denominator, same tail cutoff, so over the
  // whole record the two land on the same number instead of differing by the
  // rounding of one and the incomplete month of the other.
  const monthStart = startOfRunningMonth(input.toMs);
  const cyclesTo = monthStart > input.fromMs ? Math.min(input.toMs, monthStart) : input.toMs;
  const cyclesExcludeRunningMonth = cyclesTo < input.toMs;
  const cycleLitters = input.kindlings.filter(
    (k) => k.dateMs >= input.fromMs && k.dateMs < cyclesTo
  ).length;
  const doeYears = doeDaysIn(input.does, input.fromMs, cyclesTo) / YEAR_DAYS;
  const cyclesPerDoePerYear = doeYears > 0 ? cycleLitters / doeYears : null;

  // ── سعر التعادل ────────────────────────────────────────────────────────
  // The single most consequential number a meat farm has, and the one the app
  // could not previously state: below this price per kilo, selling more makes
  // the loss bigger.
  //
  // Costs are taken WHOLE and then offset by whatever the farm earned that
  // wasn't meat (culled does, bucks, breeding stock, manure). That offset is
  // the reason this isn't just expense ÷ kg: a farm that covers a fifth of its
  // overhead selling replacement stock genuinely needs less from each kilo of
  // meat, and charging the meat for costs the stock sales already paid would
  // print a break-even price nobody could ever hit.
  //
  // Null, never 0, when nothing was sold by weight — with no kilograms there is
  // no per-kilo anything, and a 0 here would read as "you break even for free".
  const kgSold = input.soldWeightGrams / 1000;
  const otherIncomeCents = input.incomeCents - input.soldAmountCents;
  const perKg = (cents: number) => (kgSold > 0 ? Math.round(cents / kgSold) : null);

  const realizedPricePerKgCents = perKg(input.soldAmountCents);
  const breakEvenPricePerKgCents = perKg(input.expenseCents - otherIncomeCents);
  const marginPerKgCents =
    realizedPricePerKgCents != null && breakEvenPricePerKgCents != null
      ? realizedPricePerKgCents - breakEvenPricePerKgCents
      : null;

  // A feed Transaction stores money, not weight, so the only way back to
  // kilograms is through the farm's own ton price. That makes this figure only
  // as good as that setting — which is precisely why it renders as «—» rather
  // than as a number when the price is unset, instead of quietly dividing by a
  // default nobody chose.
  const feedKgConsumed =
    input.feedPricePerTonCents > 0
      ? (input.feedExpenseCents / input.feedPricePerTonCents) * 1000
      : null;

  return {
    doeCount,
    periodDays,
    kindlings: input.kindlings.length,
    weanings: input.weanings.length,
    targetCyclesPerYear,
    cyclesPerDoePerYear,
    doeYears: doeYears > 0 ? doeYears : null,
    cyclesExcludeRunningMonth,
    cycleAchievement:
      cyclesPerDoePerYear != null && targetCyclesPerYear > 0
        ? cyclesPerDoePerYear / targetCyclesPerYear
        : null,


    weanedPerDoePerMonth: perMonth(input.weaningEvents, input.weaningEvents),
    kgSoldPerDoePerMonth: perMonth(
      input.saleEvents.map((s) => ({ dateMs: s.dateMs, value: s.grams / 1000 })),
      // Anchored on head sold, not on kilos: a month that shipped rabbits with
      // no weight typed in still started the farm's selling life.
      input.saleEvents.map((s) => ({ dateMs: s.dateMs, value: s.count }))
    ),
    // Farm-wide income and expense ALLOCATED over the does, not measured per
    // doe: feed and vet Transactions are farm-level (rabbitId is optional and
    // in practice unset), so there is no per-doe cost to read. The share a doe
    // carries here therefore includes the bucks' and the السلالات' keep too.
    // That is the honest reading of "what does a cage of mother cost me". The
    // note that used to say so on screen was removed by request; the label
    // «مصروف موزَّع لكل أم» is now the only place the allocation is stated.
    revenuePerDoePerMonthCents: perMonth(input.incomeEvents, moneyAnchor),
    costPerDoePerMonthCents: perMonth(input.expenseEvents, moneyAnchor),
    netPerDoePerMonthCents: perMonth(
      [
        ...input.incomeEvents,
        ...input.expenseEvents.map((e) => ({ dateMs: e.dateMs, value: -e.value })),
      ],
      moneyAnchor
    ),

    incomeCents: input.incomeCents,
    expenseCents: input.expenseCents,
    netCents: input.incomeCents - input.expenseCents,
    soldCount: input.soldCount,
    soldPerDoePerYear:
      doeCount > 0 && periodDays > 0
        ? (input.soldCount / doeCount) * (YEAR_DAYS / periodDays)
        : null,

    kgSold,
    realizedPricePerKgCents,
    breakEvenPricePerKgCents,
    marginPerKgCents,
    feedKgConsumed,
    feedConversionRatio:
      feedKgConsumed != null && kgSold > 0 ? feedKgConsumed / kgSold : null,
  };
}

export type IdleDoeRow = {
  id: string;
  tagId: string | null;
  breed: string | null;
  lastKindlingDate: Date | null;
  /** Days since her last kindling, or since she entered the herd if she never kindled. */
  idleDays: number;
  /** True when she has no kindling on record at all. */
  neverKindled: boolean;
};

/**
 * What the «إنتاجية القطيع» tab renders. Declared here rather than beside
 * either query so the web (src/app/reports/herd-data.ts, Prisma) and the
 * mobile app (src/mobile/db/queries.ts, SQLite) return one shared shape —
 * the two fetch layers can then only differ in HOW they read, never in what
 * the tab receives.
 */
export type HerdReport = {
  productivity: HerdProductivity;
  cycleDays: number;
  currency: string;
};

/**
 * What the «الأمهات الخاملة» tab renders, shared between the two fetch layers
 * for the same reason HerdReport is.
 *
 * Its own shape and its own query rather than a field on HerdReport: idleness
 * is measured from today and answers "who is sitting in the barn right now",
 * so it has no date range and nothing to gain from the fifteen period-bound
 * reads إنتاجية القطيع needs. Three reads instead — does, their last kindling,
 * and the farm's cycle length.
 */
export type IdleDoesReport = {
  idleDoes: IdleDoeRow[];
  /** Tagged, active does — the denominator of «نسبتهن من القطيع». */
  doeCount: number;
  cycleDays: number;
};

export type IdleDoeSource = {
  id: string;
  tagId: string | null;
  breed: string | null;
  lastKindlingDate: Date | null;
  /** acquiredDate ?? dateOfBirth ?? createdAt — when the clock started for her. */
  enteredHerdAt: Date;
};

const DAY_MS = 86_400_000;

/**
 * Does that are past due for a kindling — the names behind the gap between the
 * two sets of averages.
 *
 * "Past due" is one full configured cycle with no kindling (rebreedTarget's
 * cycleDays). A doe who last kindled 40 days ago on a طبيعي farm (cycleDays 61)
 * is mid-cycle and not listed; the same doe on a مكثف farm (cycleDays 37) is
 * three days overdue and is. So the list tightens automatically when the farm
 * commits to a faster system, which is exactly the pressure the setting is
 * supposed to apply.
 *
 * A doe who never kindled is measured from when she entered the herd, so a doe
 * bought last week doesn't show up as the farm's worst performer.
 *
 * Sorted worst-first: the top of this list is the استبعاد shortlist.
 */
export function findIdleDoes(does: IdleDoeSource[], cycleDays: number, asOf: Date): IdleDoeRow[] {
  const rows: IdleDoeRow[] = [];
  for (const doe of does) {
    const since = doe.lastKindlingDate ?? doe.enteredHerdAt;
    const idleDays = Math.floor((asOf.getTime() - since.getTime()) / DAY_MS);
    if (idleDays <= cycleDays) continue;
    rows.push({
      id: doe.id,
      tagId: doe.tagId,
      breed: doe.breed,
      lastKindlingDate: doe.lastKindlingDate,
      idleDays,
      neverKindled: doe.lastKindlingDate == null,
    });
  }
  return rows.sort((a, b) => b.idleDays - a.idleDays);
}
