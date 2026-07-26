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
 * TWO different denominators, deliberately:
 *
 *   bornAlive, nursingDeaths                     ÷ عدد الولادات في الفترة
 *   weaned, weanedStockDeaths, remainingStock    ÷ عدد مرات الفطام في الفترة
 *
 * They cannot share one denominator without lying. A litter born on the last
 * day of the period is never weaned inside it, and a weaning on the first day
 * came from a kindling ~30 days before it — dividing both halves of the cycle
 * by one count would measure each against a population that only did the other.
 *
 * EVENTS, not does: a doe that kindles twice in the period counts twice on both
 * sides. That makes bornAlive a true litter size (comparable to the breed
 * standard) rather than "kits produced per doe over the period", which is what
 * a distinct-doe denominator would give — and would silently double for any doe
 * that completed two cycles in a long report window.
 *
 * The last two numerators are farm-level ledger totals (KitStockMovement
 * carries no doeId or litter link at all), so the weaning count is simply the
 * best available proxy for "how much production this stock came from".
 *
 * `null` means the denominator was 0 — nothing of that kind happened in the
 * period — and must render «—», never 0.
 */
export type BreedingAverages = {
  /** Denominator for bornAlive: kindlings in range. */
  kindlings: number;
  /** Denominator for the last three: counted weanings in range. */
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
   * Litters in range carrying the -1 sentinel (they predate bornDeadAtKindling,
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
   * متوسط رصيد الفطام المتاح للبيع. The numerator is a RUNNING balance as of
   * the period end (the same figure as weaning.remainingStock), not what the
   * period produced — so this is "stock on hand per weaning", and it moves when
   * old stock is sold even if nothing was weaned.
   */
  remainingStock: number | null;
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
    remainingStock: per(remainingStock, weanings.length),
  };
}
