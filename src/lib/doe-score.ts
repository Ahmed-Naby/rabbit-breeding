/**
 * «درجة الأم» — one number out of 100 for a doe's productive record.
 *
 * The reports already print a doe's fertility and her average litter size side
 * by side, which is honest and slow: comparing forty does means comparing forty
 * pairs of numbers, and a doe who settles often but kindles small reads as
 * neither good nor bad until you do the multiplication in your head. This
 * module does the multiplication.
 *
 * ── What the score actually measures ────────────────────────────────────────
 * Kits born alive per mating:
 *
 *     (kindlings ÷ matings) × (born alive ÷ kindling)  =  born alive ÷ mating
 *
 * That product, not an average of the two rates, because that is how a doe
 * actually converts a cage and a service into rabbits. Averaging them would
 * score a doe who kindles from every mating at four kits the same as one who
 * kindles from half her matings at eight — and the second one gives you the
 * same rabbits for half the services.
 *
 * ── What 100 means ─────────────────────────────────────────────────────────
 * 100 is "every mating produced a litter of your barn's normal size": fertility
 * at 100%, litter size at the farm's own average. Deliberately reachable and
 * deliberately hard — nearly every real doe scores below it, so the scale keeps
 * its resolution where the herd actually sits instead of piling everyone at the
 * top the way a score against the average would.
 *
 * The reference is the farm's OWN average litter size, for the same reason
 * ./weak-does sets its relative bar there: eight kits is ordinary for one breed
 * and excellent for another. So the score answers "how well does this doe use
 * her cage, by the standard of this barn" — and a doe can pass 100 only by
 * beating both her barn's litter size and near-perfect fertility, which is why
 * the result is capped.
 *
 * ── When there is no score ─────────────────────────────────────────────────
 * Null, never zero, until she has both CULL_MIN_MATINGS matings and
 * WEAK_DOE_MIN_LITTERS kindlings behind her — a doe with two litters has no
 * reliable record, and «لم تُحسب» and «صفر» are opposite conclusions about an
 * animal someone may be about to sell.
 */

import { CULL_MIN_MATINGS } from "./cull-candidates";
import { WEAK_DOE_MIN_LITTERS } from "./weak-does-thresholds";

/**
 * One doe's lifetime tallies, as both fetch layers read them off the permanent
 * log archives (MatingLog / KindlingLog) rather than off Breeding and Litter —
 * those two are recycled by the doe's next cycle, so a lifetime judgement built
 * on them would quietly forget most of her history.
 *
 * The single input shape for everything ranked: ./weak-does and ./top-does both
 * take it, so the shortlist at the bottom of the herd and the one at the top are
 * reading the same numbers and can never disagree about a doe in the middle.
 */
export type DoeTallies = {
  id: string;
  tagId: string | null;
  breed: string | null;
  /** MatingLog rows. Includes a cycle still waiting on its outcome. */
  matings: number;
  /** KindlingLog rows. */
  kindlings: number;
  /**
   * Sum of «عدد الخلفة» (bornAliveAtKindling) across those kindlings. The birth
   * count on purpose, not the nursing one: a doe who kindled 12 and had 4
   * fostered out still *had* 12, and it is her litter size being measured.
   */
  bornAliveTotal: number;
};

/** Bands the UI colours by. A score is a prompt to look, not a verdict. */
export const DOE_SCORE_GOOD = 75;
export const DOE_SCORE_FAIR = 50;

/**
 * The colour for a score, shared by the web and the phone so the same doe is
 * never green on one screen and amber on the other. A missing score is grey,
 * not red: not knowing is not the same as knowing she is bad.
 */
export function doeScoreToneClass(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= DOE_SCORE_GOOD) return "text-emerald-600 dark:text-emerald-400";
  if (score >= DOE_SCORE_FAIR) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

/**
 * The farm's own average litter size — the denominator of every score, and the
 * same figure ./weak-does sets its relative bar against.
 *
 * Total kits over total litters: every LITTER counts once, which makes this the
 * very same «متوسط عدد البطن الحي» that متوسطات الأداء prints from
 * ./breeding-averages. That agreement is the point. It used to be an unweighted
 * mean of the per-doe averages, which is a defensible statistic — it describes
 * the typical doe rather than the typical litter — but it put two different
 * numbers under two nearly identical Arabic labels on two tabs of the same
 * report (6.2 here, 6.5 there), and a farm cannot act on a bar it has to
 * reconcile first. One «متوسط عدد الخلفة» for the whole app.
 *
 * The practical difference: a doe who kindles often now carries more weight in
 * setting the bar than one who kindles rarely, in proportion to how much of the
 * farm's production actually came out of her. Every litter is also counted now,
 * including those of does with only one or two — there is no small-sample
 * problem in a total, only in an average of averages.
 */
export function herdLitterBaseline(
  does: { kindlings: number; bornAliveTotal: number }[]
): number | null {
  let litters = 0;
  let kits = 0;
  for (const d of does) {
    litters += d.kindlings;
    kits += d.bornAliveTotal;
  }
  // A farm that has never kindled has no bar — «—», never 0, or every doe on it
  // would be scored against nothing and come out perfect.
  return litters === 0 ? null : kits / litters;
}

/**
 * A doe's score out of 100, or null when her record cannot carry one.
 *
 * `baseline` is herdLitterBaseline over the whole standing herd — pass the same
 * value for every doe on a page, or the numbers stop being comparable, which is
 * the only thing a score is for.
 */
export function scoreDoe(
  doe: { matings: number; kindlings: number; bornAliveTotal: number },
  baseline: number | null
): number | null {
  // Raw tallies rather than the two finished rates, so the minimum-sample rules
  // live here once. Both pages that print a score would otherwise have to
  // remember to apply them, and a doe scored on one litter on one screen and
  // «—» on the other is worse than no score at all.
  if (doe.matings < CULL_MIN_MATINGS || doe.kindlings < WEAK_DOE_MIN_LITTERS) return null;
  if (baseline == null || baseline <= 0) return null;

  const bornPerMating = doe.bornAliveTotal / doe.matings;
  // Capped at 100 rather than left open: past "a full litter from every
  // mating" the extra is measurement noise on a small record, and an unbounded
  // «درجة من 100» reading 130 is a broken scale, not a compliment.
  return Math.round(Math.max(0, Math.min(100, (bornPerMating / baseline) * 100)));
}
