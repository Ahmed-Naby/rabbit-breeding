/**
 * «أمهات ضعيفة الأداء» — the names behind the cull count.
 *
 * The follow-up report already prints a *number* of does under the fertility
 * threshold (countCullCandidates in ./cull-candidates), which tells a farmer
 * that six of his does are costing him money and nothing at all about which
 * six. This module produces the list, and widens the judgement from one
 * criterion to two:
 *
 *   1. خصوبة — kindlings ÷ matings. She does not settle, or does not carry.
 *   2. عدد الخلفة — average litter size at birth. She settles and carries, but
 *      brings four where the barn brings eight.
 *
 * The two are reported side by side and never merged into one score. A doe that
 * rarely settles and a doe that kindles reliably but small are different
 * problems with different answers, and a single number would hide which one is
 * on the screen.
 *
 * ── Why rearing is not a third test ─────────────────────────────────────────
 * Weaning retention (weaned ÷ the kits she was nursing) is the obvious third
 * criterion and is deliberately left out. Fostering moves kits between does, so
 * the denominator is only as honest as the fostering record, and on this farm's
 * data every doe reads as 100% — a bar nobody can fall under judges nobody. The
 * number is still on each doe's own detail page, where it is read as history
 * rather than as a verdict.
 *
 * ── Why one of the two bars is relative ─────────────────────────────────────
 * Fertility keeps the fixed 50% the cull tile already uses: a doe that fails to
 * produce a litter from half her matings is failing at her job on any farm, in
 * any breed. Litter size is not like that — eight kits is ordinary for one breed
 * and excellent for another, and a fixed number would either condemn a whole
 * good breed or excuse a whole bad barn. So that one is set against THIS farm's
 * own average, at WEAK_DOE_RELATIVE_PCT of it. The list therefore means "well
 * below what your own does manage", which is the only comparison a culling
 * decision can actually act on.
 *
 * A consequence worth stating plainly: on a farm where every doe is poor, the
 * relative bar stays quiet, because there is no worst-quarter to point at. The
 * absolute fertility bar is what still fires there, and the herd average is
 * returned alongside the list so the farmer can see the bar he is being judged
 * against and decide it is itself too low.
 *
 * ── Lifetime, never the report's date range ─────────────────────────────────
 * Every figure here is the doe's whole history, like the cull tile and unlike
 * the period totals on تقارير المتابعة. Culling is a permanent decision about
 * an animal, and a doe who had two bad months after two good years is not the
 * same animal as one who has been poor since the day she arrived. A window
 * narrow enough to be "recent" is also narrow enough to hold one unlucky cycle.
 *
 * Framework-agnostic, like ./cull-candidates: the Prisma read
 * (src/app/reports/herd-data.ts) and the SQLite read (src/mobile/db/queries.ts)
 * hand over the same tallies and cannot drift into two different answers.
 */

import { CULL_FERTILITY_THRESHOLD_PCT, CULL_MIN_MATINGS } from "./cull-candidates";
import { herdLitterBaseline, scoreDoe, type DoeTallies } from "./doe-score";
import { WEAK_DOE_MIN_LITTERS, WEAK_DOE_RELATIVE_PCT } from "./weak-does-thresholds";

export { WEAK_DOE_MIN_LITTERS, WEAK_DOE_RELATIVE_PCT };

/** Which of the two tests a doe failed. */
export type WeakDoeReason = "fertility" | "litterSize";

/** The tallies this module judges on — see DoeTallies in ./doe-score. */
export type WeakDoeSource = DoeTallies;

export type WeakDoeRow = {
  id: string;
  tagId: string | null;
  breed: string | null;
  matings: number;
  kindlings: number;
  /** Null when she has too small a sample for that test — «—», not zero. */
  fertilityRatePct: number | null;
  avgLitterSize: number | null;
  /** Her «درجة الأم» out of 100 — see ./doe-score. Null on the same terms. */
  score: number | null;
  /** Non-empty by construction: a doe with no reason is not on the list. */
  reasons: WeakDoeReason[];
};

/**
 * What the «أمهات ضعيفة الأداء» tab renders. Shared between the two fetch
 * layers for the same reason IdleDoesReport is — the web and the phone can then
 * differ only in HOW they read, never in what the tab receives.
 */
export type WeakDoesReport = {
  weakDoes: WeakDoeRow[];
  /** Tagged, active does — the denominator of «نسبتهن من القطيع». */
  doeCount: number;
  /**
   * The farm's own average: the bar the relative reason is set against, and
   * the denominator every «درجة الأم» on the page was divided by.
   */
  herdAvgLitterSize: number | null;
};

/**
 * The two per-doe rates, or null where her sample is too small to judge.
 *
 * Deliberately the same definitions computeDoeFertilityStats uses on the doe's
 * own detail page, so the numbers a farmer sees here are the numbers he sees
 * when he opens the doe to check: fertility counts every mating including one
 * still open, and litter size is the birth count.
 */
function rates(doe: WeakDoeSource) {
  return {
    fertilityRatePct:
      doe.matings >= CULL_MIN_MATINGS ? (doe.kindlings / doe.matings) * 100 : null,
    avgLitterSize:
      doe.kindlings >= WEAK_DOE_MIN_LITTERS ? doe.bornAliveTotal / doe.kindlings : null,
  };
}

/**
 * The culling shortlist, worst first.
 *
 * Pass EVERY tagged, active doe — the whole standing herd, not a pre-filtered
 * subset. The herd average that sets the relative bar is computed from what
 * arrives here, so handing in only the does already suspected of being weak
 * would move the bar down to meet them and return almost nobody.
 *
 * Sorted by how many of the two tests she failed, then by how far below the
 * bars she fell in total. Failing both is a different conversation from failing
 * one, and the sort puts that conversation at the top of the page.
 */
export function findWeakDoes(does: WeakDoeSource[]): WeakDoesReport {
  const scored = does.map((doe) => ({ doe, ...rates(doe) }));

  // Both the relative bar and the score's denominator, computed once over the
  // whole herd handed in — see herdLitterBaseline for why each doe counts once.
  const herdAvgLitterSize = herdLitterBaseline(does);

  const litterBar =
    herdAvgLitterSize == null ? null : (herdAvgLitterSize * WEAK_DOE_RELATIVE_PCT) / 100;

  const rows: { row: WeakDoeRow; shortfall: number }[] = [];

  for (const s of scored) {
    const reasons: WeakDoeReason[] = [];
    // How far below each bar she is, as a fraction of that bar, summed. Only a
    // tie-breaker between does that failed the same number of tests — it is
    // never shown, and nothing is decided by it.
    let shortfall = 0;

    if (s.fertilityRatePct != null && s.fertilityRatePct < CULL_FERTILITY_THRESHOLD_PCT) {
      reasons.push("fertility");
      shortfall += 1 - s.fertilityRatePct / CULL_FERTILITY_THRESHOLD_PCT;
    }
    if (litterBar != null && s.avgLitterSize != null && s.avgLitterSize < litterBar) {
      reasons.push("litterSize");
      shortfall += 1 - s.avgLitterSize / litterBar;
    }

    if (reasons.length === 0) continue;

    rows.push({
      shortfall,
      row: {
        id: s.doe.id,
        tagId: s.doe.tagId,
        breed: s.doe.breed,
        matings: s.doe.matings,
        kindlings: s.doe.kindlings,
        fertilityRatePct: s.fertilityRatePct,
        avgLitterSize: s.avgLitterSize,
        score: scoreDoe(s.doe, herdAvgLitterSize),
        reasons,
      },
    });
  }

  rows.sort(
    (a, b) => b.row.reasons.length - a.row.reasons.length || b.shortfall - a.shortfall
  );

  return {
    weakDoes: rows.map((r) => r.row),
    doeCount: does.length,
    herdAvgLitterSize,
  };
}
