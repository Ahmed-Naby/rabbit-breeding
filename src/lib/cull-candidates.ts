/**
 * «أمهات يجب استبعادها» / «ذكور يجب استبعادها» — breeders whose fertility has
 * fallen far enough that the feed they eat is no longer buying litters.
 *
 * The two sexes are judged on different numerators, exactly as their own report
 * pages already do:
 *   - a doe on kindlings ÷ matings (computeDoeFertilityStats), because her job
 *     is carrying the litter to term;
 *   - a buck on confirmed pregnancies ÷ matings (computeBuckFertilityStats),
 *     because his job ends at settling her — losing the pregnancy afterwards is
 *     her outcome, not his.
 * A mating still waiting on its outcome stays in the denominator either way.
 *
 * Framework-agnostic so the Prisma read and the SQLite read cannot drift: both
 * platforms hand over the same tallies and get the same count.
 */

/** Under this, on a breeder with enough matings to judge, they are a candidate. */
export const CULL_FERTILITY_THRESHOLD_PCT = 50;

/**
 * Matings a breeder must have before the ratio means anything. Without this a
 * doe mated once last week and still carrying reads 0% and would be listed for
 * culling on her first cycle — the ratio is honest, the sample is not.
 */
export const CULL_MIN_MATINGS = 3;

/** One doe's lifetime tallies. Only does still standing in the barn are passed in. */
export type DoeFertilityTally = {
  matings: number;
  kindlings: number;
};

/** One buck's lifetime tallies. Only bucks still standing in the barn are passed in. */
export type BuckFertilityTally = {
  matings: number;
  /** Matings a palpation confirmed pregnant — the buck's own success. */
  pregnancies: number;
};

/**
 * How many of these breeders fall under the threshold. Those with fewer than
 * CULL_MIN_MATINGS are not counted either way — they are unjudged, not passed.
 */
function countBelowThreshold(tallies: { matings: number; successes: number }[]): number {
  return tallies.filter(
    (t) =>
      t.matings >= CULL_MIN_MATINGS &&
      (t.successes / t.matings) * 100 < CULL_FERTILITY_THRESHOLD_PCT
  ).length;
}

export function countCullCandidates(does: DoeFertilityTally[]): number {
  return countBelowThreshold(does.map((d) => ({ matings: d.matings, successes: d.kindlings })));
}

export function countCullBucks(bucks: BuckFertilityTally[]): number {
  return countBelowThreshold(bucks.map((b) => ({ matings: b.matings, successes: b.pregnancies })));
}
