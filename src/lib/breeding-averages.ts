/**
 * «متوسطات الأداء» — the five productivity averages on the follow-up report.
 *
 * Lives here rather than in report-data.ts because that module is
 * `server-only`: the web passes Prisma rows and mobile passes local SQLite
 * rows, and both must agree on what these averages mean. Same reasoning as
 * src/lib/kit-mortality.ts, which this builds on.
 */

import { deadDuringBreeding, hasKnownSurvival } from "./kit-mortality";

/**
 * LIFETIME figures. Callers pass every kindling and weaning the farm has ever
 * logged, NOT the rows inside the report's selected period — «متوسطات الأداء»
 * describes the farm since it started and the date filter must not touch it.
 * (It used to be period-bound, which printed «—» across the board whenever the
 * chosen week happened to contain no kindling.)
 *
 * TWO different denominators, deliberately:
 *
 *   bornAlive, nursingDeaths          ÷ عدد الولادات منذ بداية العمل
 *   weaned, weanedStockDeaths         ÷ عدد مرات الفطام منذ بداية العمل
 *
 * They cannot share one denominator without lying. The two counts differ by
 * every litter that was born but never weaned, so measuring the weaning figures
 * against kindlings would score losses the weaning side never had a chance at.
 *
 * remainingStock is not an average at all — see its field doc.
 *
 * EVENTS, not does: a doe that kindled ten times counts ten times on both
 * sides. That makes bornAlive a true litter size (comparable to the breed
 * standard) rather than "kits produced per doe", which is what a distinct-doe
 * denominator would give.
 *
 * The last two numerators are farm-level ledger totals (KitStockMovement
 * carries no doeId or litter link at all), so the weaning count is simply the
 * best available proxy for "how much production this stock came from".
 *
 * `null` means the denominator was 0 — a farm that has never done that thing at
 * all — and must render «—», never 0.
 */
export type BreedingAverages = {
  /** Denominator for bornAlive: every kindling the farm ever logged. */
  kindlings: number;
  /** Denominator for weaned/weanedStockDeaths: every counted weaning, ever. */
  weanings: number;
  /** متوسط عدد البطن الحي — from bornAliveAtKindling, the frozen litter size. */
  bornAlive: number | null;
  /** متوسط نافق النتاج أثناء الرعاية — see nursingDeathsLitters for its denominator. */
  nursingDeaths: number | null;
  /**
   * The denominator actually used for nursingDeaths: litters whose nursing
   * losses are *knowable*. Deliberately not `kindlings` — see
   * unknownNursingLitters.
   */
  nursingDeathsLitters: number;
  /**
   * Litters carrying the -1 sentinel (they predate bornDeadAtKindling,
   * so their nursing losses are unrecoverable). Excluded from BOTH sides of
   * nursingDeaths rather than counted as zero losses — counting them would drag
   * the average down and flatter the herd, the exact trap kit-mortality.ts
   * warns about. Surfaced so the UI can say how much history is missing.
   */
  unknownNursingLitters: number;
  /** متوسط عدد الفطام. */
  weaned: number | null;
  /** متوسط نافق الفطام — post-weaning deaths from the kit ledger. */
  weanedStockDeaths: number | null;
  /**
   * رصيد الفطام المتاح للبيع — a TOTAL, not an average: the farm's whole
   * running balance right now. It was briefly divided (first by the weanings in
   * the period, which printed «497 لكل فطام», then by every weaning ever, which
   * printed a meaningless 0.6) — a stock level has no denominator. It moves
   * when old stock is sold even if nothing was weaned.
   */
  remainingStock: number;
};

/** The kindling fields the averages need; both platforms have all three. */
export type AverageKindlingRow = {
  bornAliveAtKindling: number;
  bornDead: number;
  bornDeadAtKindling: number;
};

/** Weaning rows must already be filtered to `weaned IS NOT NULL` by the caller:
 *  a weaning whose count hasn't been typed in yet would otherwise join the
 *  denominator with nothing in the numerator and depress every average. */
export type AverageWeaningRow = { weaned: number | null };

/** Every argument is lifetime — see the note on BreedingAverages. */
export function computeBreedingAverages(
  kindlings: AverageKindlingRow[],
  weanings: AverageWeaningRow[],
  weanedStockDeaths: number,
  remainingStock: number
): BreedingAverages {
  // Only litters whose losses are knowable, on both sides of the fraction.
  const knownNursing = kindlings.filter(hasKnownSurvival);

  const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0);
  const per = (total: number, n: number) => (n > 0 ? total / n : null);

  return {
    kindlings: kindlings.length,
    weanings: weanings.length,
    bornAlive: per(sum(kindlings.map((k) => k.bornAliveAtKindling)), kindlings.length),
    nursingDeaths: per(sum(knownNursing.map(deadDuringBreeding)), knownNursing.length),
    nursingDeathsLitters: knownNursing.length,
    unknownNursingLitters: kindlings.length - knownNursing.length,
    weaned: per(sum(weanings.map((w) => w.weaned ?? 0)), weanings.length),
    weanedStockDeaths: per(weanedStockDeaths, weanings.length),
    // Passed straight through — no denominator, so no null case either.
    remainingStock,
  };
}
