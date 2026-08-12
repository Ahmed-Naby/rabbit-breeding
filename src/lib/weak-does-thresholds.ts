/**
 * The two thresholds «أمهات ضعيفة الأداء» judges by, in their own module so
 * ./doe-score can share the minimum-sample rule without importing ./weak-does
 * and ./weak-does importing it straight back.
 *
 * Both are re-exported from ./weak-does, which is where they read naturally;
 * this file exists for the import graph, not for callers.
 */

/**
 * How far under the farm's own average counts as weak, for the relative
 * criterion. 75% is a quarter below the barn — far enough out that it is not
 * ordinary variation between does, close enough that a farm with a genuinely
 * weak tail still sees it.
 */
export const WEAK_DOE_RELATIVE_PCT = 75;

/**
 * Kindlings a doe must have before her average litter size is judged — or
 * scored. One small litter is luck; three is her.
 *
 * The same guard CULL_MIN_MATINGS provides for fertility, for the same reason:
 * without it, a doe whose first litter came out at four would be printed as the
 * farm's worst mother on the strength of a single birth.
 */
export const WEAK_DOE_MIN_LITTERS = 3;
