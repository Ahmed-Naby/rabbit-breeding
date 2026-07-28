/**
 * «العلف المتوقع» — what the herd standing in the barn today should eat, and
 * what that costs at the farm's own ton price.
 *
 * This is a PLAN, not a measurement, and the distinction is the reason the
 * module exists separately from the finance ledger. The ledger knows what was
 * paid for feed; it does not know how much feed that was, because a feed
 * Transaction stores money and nothing else. This side knows how much feed the
 * herd needs; it does not know what was actually poured. Putting the two next
 * to each other is the whole value: a farm whose real bills run 30% above the
 * expected ration is either overfeeding, wasting, or being robbed, and none of
 * those are visible from either number alone.
 *
 * Rations are per animal class because that is how rabbits actually eat — the
 * same doe is a 150g animal empty, a 200g animal pregnant and a 275g animal
 * nursing a litter. Any single "per doe" figure is wrong for most of the herd
 * most of the time.
 *
 * Framework-agnostic (no Prisma, no server-only), like herd-productivity.ts:
 * the web passes Prisma counts and mobile passes SQLite counts, and the two
 * must never disagree about what the number means.
 */

/** The per-head daily rations, in grams. 0 anywhere means "not set". */
export type FeedRations = {
  feedGramsDoeIdlePerDay: number;
  feedGramsDoePregnantPerDay: number;
  feedGramsDoeNursingPerDay: number;
  feedGramsBuckPerDay: number;
  feedGramsGrowerPerDay: number;
  feedGramsJuvenilePerDay: number;
};

export const RATION_KEYS = [
  "feedGramsDoeIdlePerDay",
  "feedGramsDoePregnantPerDay",
  "feedGramsDoeNursingPerDay",
  "feedGramsBuckPerDay",
  "feedGramsGrowerPerDay",
  "feedGramsJuvenilePerDay",
] as const satisfies readonly (keyof FeedRations)[];

/**
 * Head counts by class, as the herd stands right now.
 *
 * `growers` is رصيد الفطام — weaned kits still on the farm waiting to be sold.
 * A nursing doe's ration already covers the kits under her, so a kit must be
 * counted on exactly one side of weaning or its feed is paid for twice.
 */
export type HerdComposition = {
  doesIdle: number;
  doesPregnant: number;
  doesNursing: number;
  bucks: number;
  growers: number;
  juveniles: number;
};

export type FeedPlan = {
  composition: HerdComposition;
  /** Total head the plan covers — 0 means there is nothing to feed yet. */
  headCount: number;
  /** Grams the whole farm eats per day at the configured rations. */
  gramsPerDay: number;
  /** The same in kg over a 30-day month, which is how feed is bought. */
  kgPerMonth: number;
  /**
   * Cost figures, or null when the ton price is unset — deliberately null and
   * not 0, so an unpriced farm renders «—» instead of a free lunch.
   */
  costPerMonthCents: number | null;
  /** Allocated over the does, to sit beside the report's مصروف لكل أم. */
  costPerDoePerDayCents: number | null;
  /** Per-class breakdown, so a farm can see which class carries the bill. */
  lines: FeedPlanLine[];
};

export type FeedPlanLine = {
  key: (typeof RATION_KEYS)[number];
  head: number;
  gramsPerHeadPerDay: number;
  gramsPerDay: number;
  costPerMonthCents: number | null;
};

const MONTH_DAYS = 30;
const GRAMS_PER_TON = 1_000_000;

/** Cost of `grams` of feed at `pricePerTonCents`. Null when unpriced. */
export function feedCostCents(grams: number, pricePerTonCents: number): number | null {
  if (pricePerTonCents <= 0) return null;
  return Math.round((grams * pricePerTonCents) / GRAMS_PER_TON);
}

export function computeFeedPlan(
  composition: HerdComposition,
  rations: FeedRations,
  feedPricePerTonCents: number
): FeedPlan {
  const pairs: { key: (typeof RATION_KEYS)[number]; head: number }[] = [
    { key: "feedGramsDoeIdlePerDay", head: composition.doesIdle },
    { key: "feedGramsDoePregnantPerDay", head: composition.doesPregnant },
    { key: "feedGramsDoeNursingPerDay", head: composition.doesNursing },
    { key: "feedGramsBuckPerDay", head: composition.bucks },
    { key: "feedGramsGrowerPerDay", head: composition.growers },
    { key: "feedGramsJuvenilePerDay", head: composition.juveniles },
  ];

  const lines: FeedPlanLine[] = pairs.map(({ key, head }) => {
    const gramsPerHeadPerDay = rations[key];
    const gramsPerDay = head * gramsPerHeadPerDay;
    return {
      key,
      head,
      gramsPerHeadPerDay,
      gramsPerDay,
      costPerMonthCents: feedCostCents(gramsPerDay * MONTH_DAYS, feedPricePerTonCents),
    };
  });

  const gramsPerDay = lines.reduce((s, l) => s + l.gramsPerDay, 0);
  const headCount = pairs.reduce((s, p) => s + p.head, 0);
  const does = composition.doesIdle + composition.doesPregnant + composition.doesNursing;
  const costPerMonthCents = feedCostCents(gramsPerDay * MONTH_DAYS, feedPricePerTonCents);

  return {
    composition,
    headCount,
    gramsPerDay,
    kgPerMonth: (gramsPerDay * MONTH_DAYS) / 1000,
    costPerMonthCents,
    // Per DOE, not per head: the bucks' and the growers' keep is part of what a
    // mother cage costs, the same allocation إنتاجية القطيع makes. Null rather
    // than 0 on a farm with no does, so it reads as "cannot say".
    costPerDoePerDayCents:
      costPerMonthCents != null && does > 0
        ? Math.round(costPerMonthCents / does / MONTH_DAYS)
        : null,
    lines,
  };
}
