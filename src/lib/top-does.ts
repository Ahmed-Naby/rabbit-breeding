/**
 * «أفضل الأمهات» — the other end of the same ranking ./weak-does produces.
 *
 * The culling shortlist answers "which does are costing me money". This one
 * answers the question that actually grows a farm: which does should the next
 * generation of replacements come out of. A barn improves far more by breeding
 * from its best five than by selling its worst five, and until now the app
 * could name the worst and not the best.
 *
 * Same tallies, same score, same herd baseline as ./weak-does — deliberately,
 * so the two tabs are two views of one ranking. A doe cannot be praised on one
 * screen and condemned on the other, and the owner comparing them is reading
 * one number computed one way.
 *
 * ── Who is eligible ────────────────────────────────────────────────────────
 * Only does the score can actually be computed for: enough matings and enough
 * kindlings behind them (see scoreDoe). A doe with one brilliant litter is not
 * the farm's best mother, she is the farm's luckiest, and putting her at the
 * top of a list headed «أفضل الأمهات» would send her daughters into the breeding
 * pen on the strength of a single birth.
 *
 * ── The tie-break ──────────────────────────────────────────────────────────
 * Equal scores are broken by kindlings, most first: two does at 78 are not
 * equally proven when one has eight litters behind the number and the other
 * three. The longer record is the safer bet, and this list exists to be bet on.
 */

import { herdLitterBaseline, scoreDoe, type DoeTallies } from "./doe-score";

/**
 * How much of the herd the tab lists, as a percentage of the standing does.
 *
 * A share rather than a fixed count, because "the best twenty" means something
 * different in a barn of 30 does than in a barn of 400: in the first it is most
 * of the herd, in the second it is the top 5%. Half the herd is the useful line
 * — it is the better half, which is exactly the population a farm keeps
 * breeding from and replaces the other half out of.
 */
export const TOP_DOE_SHARE_PCT = 50;

/** The share turned into a row count for a herd of this size. */
export function topDoeLimit(doeCount: number): number {
  return Math.ceil((doeCount * TOP_DOE_SHARE_PCT) / 100);
}

export type TopDoeRow = {
  id: string;
  tagId: string | null;
  breed: string | null;
  matings: number;
  kindlings: number;
  fertilityRatePct: number;
  avgLitterSize: number;
  /** Never null here: a doe without a score is not ranked at all. */
  score: number;
};

export type TopDoesReport = {
  topDoes: TopDoeRow[];
  /** Tagged, active does — the whole standing herd. */
  doeCount: number;
  /** Of those, how many had enough record to be scored at all. */
  rankedCount: number;
  /** How many rows the share allowed for this herd — the cap topDoes was cut to. */
  limit: number;
  /** The farm's own average litter size — the score's denominator. */
  herdAvgLitterSize: number | null;
  /** Mean score across every ranked doe, so the top of the list has a middle to sit above. */
  herdAvgScore: number | null;
};

/**
 * The breeding shortlist, best first.
 *
 * Pass EVERY tagged, active doe, exactly as findWeakDoes wants them: the score's
 * denominator AND the row count are both computed from what arrives here, so
 * handing in a pre-filtered "probably good" subset would raise the bar to meet
 * them and then halve the list on top of that.
 */
export function findTopDoes(
  does: DoeTallies[],
  limit = topDoeLimit(does.length)
): TopDoesReport {
  const herdAvgLitterSize = herdLitterBaseline(does);

  const ranked: TopDoeRow[] = [];
  for (const doe of does) {
    const score = scoreDoe(doe, herdAvgLitterSize);
    if (score == null) continue;
    ranked.push({
      id: doe.id,
      tagId: doe.tagId,
      breed: doe.breed,
      matings: doe.matings,
      kindlings: doe.kindlings,
      // Both are safe divisions: scoreDoe returned a number, so she cleared the
      // minimum mating and kindling counts.
      fertilityRatePct: (doe.kindlings / doe.matings) * 100,
      avgLitterSize: doe.bornAliveTotal / doe.kindlings,
      score,
    });
  }

  ranked.sort((a, b) => b.score - a.score || b.kindlings - a.kindlings);

  return {
    topDoes: ranked.slice(0, limit),
    doeCount: does.length,
    rankedCount: ranked.length,
    limit,
    herdAvgLitterSize,
    // The average over everyone scored, not over the slice printed — otherwise
    // the "farm average" would be the average of the best twenty.
    herdAvgScore:
      ranked.length === 0
        ? null
        : ranked.reduce((sum, r) => sum + r.score, 0) / ranked.length,
  };
}
