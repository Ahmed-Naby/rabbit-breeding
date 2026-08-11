/**
 * «أمهات يجب استبعادها» — does whose fertility has fallen far enough that the
 * feed they eat is no longer buying litters.
 *
 * Fertility is the same plain ratio the doe detail page prints, kindlings ÷
 * matings — see computeDoeFertilityStats, which explains why a mating still
 * waiting on its outcome stays in the denominator.
 *
 * Framework-agnostic so the Prisma read and the SQLite read cannot drift: both
 * platforms hand over the same three columns per doe and get the same count.
 */

/** Under this, on a doe with enough matings to judge, she is a candidate. */
export const CULL_FERTILITY_THRESHOLD_PCT = 50;

/**
 * Matings a doe must have before the ratio means anything. Without this a doe
 * mated once last week and still carrying reads 0% and would be listed for
 * culling on her first cycle — the ratio is honest, the sample is not.
 */
export const CULL_MIN_MATINGS = 3;

/** One doe's lifetime tallies. Only does still standing in the barn are passed in. */
export type DoeFertilityTally = {
  matings: number;
  kindlings: number;
};

/**
 * How many of these does fall under the threshold. Does with fewer than
 * CULL_MIN_MATINGS are not counted either way — they are unjudged, not passed.
 */
export function countCullCandidates(does: DoeFertilityTally[]): number {
  return does.filter(
    (d) =>
      d.matings >= CULL_MIN_MATINGS &&
      (d.kindlings / d.matings) * 100 < CULL_FERTILITY_THRESHOLD_PCT
  ).length;
}
