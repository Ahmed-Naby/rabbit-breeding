/**
 * Framework-agnostic fertility/productivity stats for a doe, derived from
 * her stitched breeding cycles (see breeding-history.tsx's buildDoeCycles /
 * the mobile bundle's fetchDoeBreedingHistory — both produce rows shaped
 * closely enough to satisfy DoeCycleInput). Shared so the web detail page
 * and the offline mobile detail page compute identical numbers.
 */
export type DoeCycleInput = {
  testResult: string | null;
  kindlingDate: unknown;
  bornAlive: number | null;
  weaned: number | null;
};

export type DoeFertilityStats = {
  totalMatings: number;
  /** Number of cycles that actually kindled. */
  totalKindlings: number;
  /** % of matings with a known outcome that ended in a kindling. Null if no cycle has resolved yet. */
  fertilityRatePct: number | null;
  /** Average born-alive count across cycles that actually kindled. */
  avgLitterSize: number | null;
  /** Average weaned count across cycles with a recorded weaning. */
  avgWeaned: number | null;
  /** Aggregate weaned / born-alive across cycles with both recorded. */
  weaningRetentionPct: number | null;
};

export function computeDoeFertilityStats(cycles: DoeCycleInput[]): DoeFertilityStats {
  const totalMatings = cycles.length;

  const kindled = cycles.filter((c) => c.kindlingDate != null);
  // A cycle with no test result yet and no kindling is still in progress —
  // excluded from the denominator so an open mating doesn't drag the rate
  // down before its outcome is even known.
  const pending = cycles.filter((c) => c.testResult == null && c.kindlingDate == null);
  const resolved = totalMatings - pending.length;
  const fertilityRatePct = resolved > 0 ? (kindled.length / resolved) * 100 : null;

  const avgLitterSize =
    kindled.length > 0
      ? kindled.reduce((sum, c) => sum + (c.bornAlive ?? 0), 0) / kindled.length
      : null;

  const weanedCycles = cycles.filter((c) => c.weaned != null);
  const avgWeaned =
    weanedCycles.length > 0
      ? weanedCycles.reduce((sum, c) => sum + (c.weaned ?? 0), 0) / weanedCycles.length
      : null;

  const retentionCycles = cycles.filter((c) => c.weaned != null && c.bornAlive != null && c.bornAlive > 0);
  const totalWeaned = retentionCycles.reduce((sum, c) => sum + (c.weaned ?? 0), 0);
  const totalBornAlive = retentionCycles.reduce((sum, c) => sum + (c.bornAlive ?? 0), 0);
  const weaningRetentionPct = totalBornAlive > 0 ? (totalWeaned / totalBornAlive) * 100 : null;

  return {
    totalMatings,
    totalKindlings: kindled.length,
    fertilityRatePct,
    avgLitterSize,
    avgWeaned,
    weaningRetentionPct,
  };
}
