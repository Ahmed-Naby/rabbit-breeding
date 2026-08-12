/**
 * «أمهات ضعيفة الأداء» — the names behind the cull count.
 *
 * The follow-up report already prints a *number* of does under the fertility
 * threshold (countCullCandidates in ./cull-candidates), which tells a farmer
 * that six of his does are costing him money and nothing at all about which
 * six. This module produces the list, and widens the judgement from one
 * criterion to the three a breeder actually culls on:
 *
 *   1. خصوبة — kindlings ÷ matings. She does not settle, or does not carry.
 *   2. عدد الخلفة — average litter size at birth. She settles and carries, but
 *      brings four where the barn brings eight.
 *   3. الرعاية — weaned ÷ the kits she was nursing. She has them and loses them.
 *
 * The three are reported side by side and never merged into one score. A doe
 * with excellent fertility that eats her litters and a doe that kindles small
 * but raises every kit are different problems with different answers, and a
 * single number would hide which one is on the screen.
 *
 * ── Why two of the three bars are relative ──────────────────────────────────
 * Fertility keeps the fixed 50% the cull tile already uses: a doe that fails to
 * produce a litter from half her matings is failing at her job on any farm, in
 * any breed. Litter size and rearing are not like that — eight kits is ordinary
 * for one breed and excellent for another, and a fixed number would either
 * condemn a whole good breed or excuse a whole bad barn. So those two are set
 * against THIS farm's own average, at WEAK_DOE_RELATIVE_PCT of it. The list
 * therefore always means "well below what your own does manage", which is the
 * only comparison a culling decision can actually act on.
 *
 * A consequence worth stating plainly: on a farm where every doe is poor, the
 * relative bars stay quiet, because there is no worst-quarter to point at. The
 * absolute fertility bar is what still fires there, and the herd averages are
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

/**
 * How far under the farm's own average counts as weak, for the two relative
 * criteria. 75% is a quarter below the barn — far enough out that it is not
 * ordinary variation between does, close enough that a farm with a genuinely
 * weak tail still sees it.
 */
export const WEAK_DOE_RELATIVE_PCT = 75;

/**
 * Kindlings a doe must have before her average litter size is judged, and
 * weanings before her rearing is. One small litter is luck; three is her.
 *
 * The same guard CULL_MIN_MATINGS provides for fertility, for the same reason:
 * without it, a doe whose first litter came out at four would be printed as the
 * farm's worst mother on the strength of a single birth.
 */
export const WEAK_DOE_MIN_LITTERS = 3;

/** Which of the three tests a doe failed. */
export type WeakDoeReason = "fertility" | "litterSize" | "rearing";

/**
 * One doe's lifetime tallies, as both fetch layers read them off the permanent
 * log archives (MatingLog / KindlingLog / WeaningLog) rather than off Breeding
 * and Litter — those two are recycled by the doe's next cycle, so a lifetime
 * judgement built on them would quietly forget most of her history.
 */
export type WeakDoeSource = {
  id: string;
  tagId: string | null;
  breed: string | null;
  /** MatingLog rows. Includes a cycle still waiting on its outcome — see below. */
  matings: number;
  /** KindlingLog rows. */
  kindlings: number;
  /**
   * Sum of «عدد الخلفة» (bornAliveAtKindling) across those kindlings. The birth
   * count on purpose, not the nursing one: a doe who kindled 12 and had 4
   * fostered out still *had* 12, and it is her litter size being measured.
   */
  bornAliveTotal: number;
  /** Weaning rows with a weaned count AND kits under her care — the rearing sample. */
  weaningCycles: number;
  /** Sum of «تحت الرعاية» (WeaningLog.bornAlive) over those cycles — the denominator. */
  nursedTotal: number;
  /** Sum of weaned over those cycles — the numerator. */
  weanedTotal: number;
};

export type WeakDoeRow = {
  id: string;
  tagId: string | null;
  breed: string | null;
  matings: number;
  kindlings: number;
  /** Null when she has too small a sample for that test — «—», not zero. */
  fertilityRatePct: number | null;
  avgLitterSize: number | null;
  weaningRetentionPct: number | null;
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
  /** The farm's own averages: the bars the two relative reasons are set against. */
  herdAvgLitterSize: number | null;
  herdAvgRetentionPct: number | null;
};

/** Mean of the values that exist, or null when none do. */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * The three per-doe rates, or null where her sample is too small to judge.
 *
 * Deliberately the same definitions computeDoeFertilityStats uses on the doe's
 * own detail page, so the numbers a farmer sees here are the numbers he sees
 * when he opens the doe to check: fertility counts every mating including one
 * still open, litter size is the birth count, and retention is weaned ÷ the
 * kits she was actually nursing.
 */
function rates(doe: WeakDoeSource) {
  return {
    fertilityRatePct:
      doe.matings >= CULL_MIN_MATINGS ? (doe.kindlings / doe.matings) * 100 : null,
    avgLitterSize:
      doe.kindlings >= WEAK_DOE_MIN_LITTERS ? doe.bornAliveTotal / doe.kindlings : null,
    weaningRetentionPct:
      doe.weaningCycles >= WEAK_DOE_MIN_LITTERS && doe.nursedTotal > 0
        ? (doe.weanedTotal / doe.nursedTotal) * 100
        : null,
  };
}

/**
 * The culling shortlist, worst first.
 *
 * Pass EVERY tagged, active doe — the whole standing herd, not a pre-filtered
 * subset. The herd averages that set two of the three bars are computed from
 * what arrives here, so handing in only the does already suspected of being
 * weak would move the bar down to meet them and return almost nobody.
 *
 * Sorted by how many of the three tests she failed, then by how far below the
 * bars she fell in total. Failing all three is a different conversation from
 * failing one, and the sort puts that conversation at the top of the page.
 */
export function findWeakDoes(does: WeakDoeSource[]): WeakDoesReport {
  const scored = does.map((doe) => ({ doe, ...rates(doe) }));

  // Each doe counts once, however many litters she has had: the bar is meant to
  // describe a typical doe in this barn, and a total-over-total mean would let
  // the two hardest-working does set the standard the quiet ones are judged by.
  const herdAvgLitterSize = mean(
    scored.flatMap((s) => (s.avgLitterSize == null ? [] : [s.avgLitterSize]))
  );
  const herdAvgRetentionPct = mean(
    scored.flatMap((s) => (s.weaningRetentionPct == null ? [] : [s.weaningRetentionPct]))
  );

  const litterBar =
    herdAvgLitterSize == null ? null : (herdAvgLitterSize * WEAK_DOE_RELATIVE_PCT) / 100;
  const retentionBar =
    herdAvgRetentionPct == null ? null : (herdAvgRetentionPct * WEAK_DOE_RELATIVE_PCT) / 100;

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
    if (
      retentionBar != null &&
      s.weaningRetentionPct != null &&
      s.weaningRetentionPct < retentionBar
    ) {
      reasons.push("rearing");
      shortfall += retentionBar > 0 ? 1 - s.weaningRetentionPct / retentionBar : 1;
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
        weaningRetentionPct: s.weaningRetentionPct,
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
    herdAvgRetentionPct,
  };
}
