/**
 * Framework-agnostic fertility stats for a buck, derived from his stitched
 * cycles (see buck-breeding-history.tsx's buildBuckCycles / the mobile
 * bundle's fetchBuckBreedingHistory). Shared so the web detail page and the
 * offline mobile detail page compute identical numbers.
 *
 * Deliberately NOT computeDoeFertilityStats: the two answer different
 * questions. A doe is judged on carrying a litter to term, so her rate counts
 * kindlings. A buck's only job is settling her — whether she then holds the
 * pregnancy is hers, not his — so his rate counts confirmed pregnancies.
 */
export type BuckCycleInput = {
  /** Palpation outcome: "positive" | "negative", or null if not palpated yet. */
  testResult: string | null;
  kindlingDate: unknown;
  /**
   * «عدد الخلفة» — born alive at the kindling moment, frozen.
   * Optional: callers whose source predates the column fall back to bornAlive.
   */
  bornAliveAtKindling?: number | null;
  bornAlive: number | null;
};

export type BuckFertilityStats = {
  totalMatings: number;
  /** Matings confirmed pregnant by palpation. */
  confirmedPregnancies: number;
  /** % of matings that settled the doe. Null if he has never been used. */
  fertilityRatePct: number | null;
  /** Average litter size at birth across the cycles that did kindle. */
  avgLitterSize: number | null;
};

export function computeBuckFertilityStats(cycles: BuckCycleInput[]): BuckFertilityStats {
  const totalMatings = cycles.length;

  // Positive palpation only. A cycle that kindled without one recorded won't
  // count here — possible because recordKindlingOp (the rabbit-card form) is an
  // alternate entry point that doesn't require a test first, unlike the does
  // board's pregnant → kindle path.
  const confirmedPregnancies = cycles.filter((c) => c.testResult === "positive").length;
  const fertilityRatePct = totalMatings > 0 ? (confirmedPregnancies / totalMatings) * 100 : null;

  // Litter size stays on the kindlings, since an unborn litter has no size.
  // This measures the litters he sired, not his settling rate above.
  const kindled = cycles.filter((c) => c.kindlingDate != null);
  const avgLitterSize =
    kindled.length > 0
      ? kindled.reduce((sum, c) => sum + (c.bornAliveAtKindling ?? c.bornAlive ?? 0), 0) /
        kindled.length
      : null;

  return { totalMatings, confirmedPregnancies, fertilityRatePct, avgLitterSize };
}
