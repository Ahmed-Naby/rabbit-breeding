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

/** Kindling fields needed here; every KindlingLog row on both platforms has them. */
export type HerdKindlingRow = {
  /** Frozen litter size at birth — «عدد الخلفة». */
  bornAliveAtKindling: number;
  /** Live count under her care right now — «عدد الرعاية»; moves with fostering and deaths. */
  bornAlive: number;
  /** Stillborn + every pre-weaning death recorded since — see kit-mortality.ts. */
  bornDead: number;
};

export type HerdProductivityInput = {
  /** THE denominator: tagged, active does currently in the herd. */
  doeCount: number;
  /** Length of the selected period in days, used to annualise/monthlyise. */
  periodDays: number;
  /** One full reproductive cycle in days — see rebreedTarget. */
  cycleDays: number;
  /** Cycles a year the configured system promises — see rebreedTarget. */
  targetCyclesPerYear: number;
  kindlings: HerdKindlingRow[];
  /** Weaning rows in range, already filtered to `weaned IS NOT NULL` by the caller. */
  weanings: { weaned: number | null }[];
  /** KitStockMovement(type: "death") in range — post-weaning losses. */
  weanedStockDeaths: number;
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
  /** الفجوة: actual ÷ target, 0–1+. null when either side is unknown. */
  cycleAchievement: number | null;

  bornAlivePerDoe: number | null;
  nursedPerDoe: number | null;
  kitDeathsPerDoe: number | null;
  weanedPerDoe: number | null;

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

/** A 30-day month, matching the rest of the reports (see report-data.ts). */
const MONTH_DAYS = 30;
const YEAR_DAYS = 365;

/**
 * Cycles a year each rebreed system promises — the very numbers printed on the
 * three options in الإعدادات («مكثف … 10 دورات في السنة» and friends).
 *
 * Deliberately NOT derived as 365 ÷ (gestationDays + rebreedAfterKindlingDays).
 * That arithmetic gives 12.2 for مكثف on a 30-day gestation, because it assumes
 * a doe conceives on the very day she is presented, every time, forever. Using
 * it would print a target the farm was never sold and mark a herd hitting its
 * advertised 10 cycles as an 82% failure. The published figures already carry
 * the practical slack for missed services and repeat matings, so they are the
 * honest bar — and they are the bar the user chose when they picked the option.
 */
const TARGET_CYCLES_PER_YEAR: Record<number, number> = {
  0: 10, // مكثف — تلقيح يوم الولادة
  10: 8, // نصف مكثف — 10 أيام بعد الولادة
  30: 6, // طبيعي — 30 يومًا بعد الولادة
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
 * The farm's own target, from its rebreed setting. `15` — the retired نصف مكثف
 * offset that validations.ts still accepts so an old farm can re-save — has no
 * published figure, so it falls back to the biological arithmetic; it is the
 * one case where an approximate target beats none at all.
 */
export function rebreedTarget(
  rebreedAfterKindlingDays: number,
  gestationDays: number
): RebreedTarget {
  const published = TARGET_CYCLES_PER_YEAR[rebreedAfterKindlingDays];
  const targetCyclesPerYear =
    published ?? YEAR_DAYS / Math.max(1, gestationDays + rebreedAfterKindlingDays);
  return {
    targetCyclesPerYear,
    cycleDays: Math.round(YEAR_DAYS / targetCyclesPerYear),
  };
}

const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0);

export function computeHerdProductivity(input: HerdProductivityInput): HerdProductivity {
  const { doeCount, periodDays, targetCyclesPerYear } = input;

  // `null`, never 0, when there is nothing to divide by — an empty herd or a
  // zero-length range must render «—» so nobody reads "0 kits per doe" off a
  // farm that simply has no does on file yet.
  const perDoe = (total: number) => (doeCount > 0 ? total / doeCount : null);
  // Per doe per 30 days. Guards on periodDays too: a same-day from/to would
  // otherwise blow every monthly figure up to Infinity.
  const perDoePerMonth = (total: number) =>
    doeCount > 0 && periodDays > 0 ? (total / doeCount) * (MONTH_DAYS / periodDays) : null;

  const cyclesPerDoePerYear =
    doeCount > 0 && periodDays > 0
      ? (input.kindlings.length / doeCount) * (YEAR_DAYS / periodDays)
      : null;

  // Total kits lost from birth to weaning. `bornDead` is used whole, for every
  // row including the ones carrying the bornDeadAtKindling sentinel: unlike
  // «متوسط نافق النتاج أثناء الرعاية», this figure does not need the
  // stillborn/nursing split, so a legacy row is still perfectly countable here
  // and there is nothing to exclude. Post-weaning deaths are added because at
  // herd level a kit lost in the selling cages is the same lost revenue as one
  // lost in the nest.
  const kitDeaths = sum(input.kindlings.map((k) => k.bornDead)) + input.weanedStockDeaths;

  const weanedTotal = sum(input.weanings.map((w) => w.weaned ?? 0));

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
    cycleAchievement:
      cyclesPerDoePerYear != null && targetCyclesPerYear > 0
        ? cyclesPerDoePerYear / targetCyclesPerYear
        : null,

    bornAlivePerDoe: perDoe(sum(input.kindlings.map((k) => k.bornAliveAtKindling))),
    nursedPerDoe: perDoe(sum(input.kindlings.map((k) => k.bornAlive))),
    kitDeathsPerDoe: perDoe(kitDeaths),
    weanedPerDoe: perDoe(weanedTotal),

    weanedPerDoePerMonth: perDoePerMonth(weanedTotal),
    kgSoldPerDoePerMonth: perDoePerMonth(input.soldWeightGrams / 1000),
    // Farm-wide income and expense ALLOCATED over the does, not measured per
    // doe: feed and vet Transactions are farm-level (rabbitId is optional and
    // in practice unset), so there is no per-doe cost to read. The share a doe
    // carries here therefore includes the bucks' and the السلالات' keep too.
    // That is the honest reading of "what does a cage of mother cost me", but
    // the UI must say it is an allocation — see herdCostNote.
    revenuePerDoePerMonthCents: perDoePerMonth(input.incomeCents),
    costPerDoePerMonthCents: perDoePerMonth(input.expenseCents),
    netPerDoePerMonthCents: perDoePerMonth(input.incomeCents - input.expenseCents),

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
  idleDoes: IdleDoeRow[];
  cycleDays: number;
  currency: string;
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
