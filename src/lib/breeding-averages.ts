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

/**
 * متوسط البيع الشهري — lifetime sales spread over the months the farm has been
 * running. Its own type because its denominator is time, not an event count:
 * nothing in BreedingAverages divides by months.
 */
export type MonthlySales = {
  /** Every head ever sold out of the weaned-stock ledger. */
  totalSold: number;
  /** Whole months the farm has been running. Also the printed denominator. */
  months: number;
  /** null only for a farm with no history at all. */
  perMonth: number | null;
};

/** The mean Gregorian month. Calendar months would make «÷ 20 شهر» ambiguous. */
const AVG_MONTH_MS = 30.436875 * 86_400_000;

/**
 * Months are counted from the farm's FIRST recorded event, not its first sale:
 * a farm that took three months to sell its first batch really did average less
 * per month over its life, and starting the clock at the first sale would hide
 * exactly that.
 *
 * The quotient uses the same rounded month count that gets printed, so the
 * displayed «÷ N شهر» always reproduces the number beside it.
 */
export function computeMonthlySales(
  totalSold: number,
  firstEventMs: number | null,
  nowMs: number
): MonthlySales {
  if (firstEventMs == null) return { totalSold, months: 0, perMonth: null };
  // At least one month: a farm two weeks old would otherwise divide by a
  // fraction and claim a monthly rate it has never actually sustained.
  const months = Math.max(1, Math.round((nowMs - firstEventMs) / AVG_MONTH_MS));
  return { totalSold, months, perMonth: totalSold / months };
}

/**
 * متوسط الفطام المباع لكل ولادة, matched to the litters that produced the sale.
 *
 * NOT lifetime sales ÷ lifetime weanings. That divides today's sales by litters
 * weaned last week whose stock has not been sold yet, so it slides downward for
 * no reason other than the farm being busy lately. Instead each month is scored
 * on its own — sales in the month ÷ weaning events in the month BEFORE it — and
 * those monthly figures are averaged, each month counting once regardless of
 * its size.
 */
export type LaggedSoldPerWeaning = {
  /** How many monthly figures went into the mean; also the printed denominator. */
  months: number;
  /** null when no month has a scoreable predecessor yet. */
  perWeaning: number | null;
};

/** One dated quantity. For weanings the caller passes one row per event. */
export type DatedCount = { dateMs: number; count: number };

/** Calendar months as a single comparable number, so m-1 crosses years safely. */
function monthIndex(ms: number): number {
  const d = new Date(ms);
  return d.getFullYear() * 12 + d.getMonth();
}

export function computeLaggedSoldPerWeaning(
  sales: DatedCount[],
  weanings: DatedCount[],
  nowMs: number
): LaggedSoldPerWeaning {
  const soldByMonth = new Map<number, number>();
  for (const s of sales) {
    const m = monthIndex(s.dateMs);
    soldByMonth.set(m, (soldByMonth.get(m) ?? 0) + s.count);
  }
  const weanedByMonth = new Map<number, number>();
  for (const w of weanings) {
    const m = monthIndex(w.dateMs);
    weanedByMonth.set(m, (weanedByMonth.get(m) ?? 0) + w.count);
  }

  const currentMonth = monthIndex(nowMs);
  const ratios: number[] = [];
  for (const [month, weaned] of weanedByMonth) {
    const scored = month + 1;
    // The running month is excluded: three days of sales against a full month
    // of weanings would drag the mean down every time the report is opened.
    if (weaned <= 0 || scored >= currentMonth) continue;
    // A month that sold nothing after a productive one scores a real 0 — it is
    // not missing data, and dropping it would flatter the farm.
    ratios.push((soldByMonth.get(scored) ?? 0) / weaned);
  }

  if (ratios.length === 0) return { months: 0, perWeaning: null };
  // Unweighted: every month counts once, whatever its volume.
  return {
    months: ratios.length,
    perWeaning: ratios.reduce((s, r) => s + r, 0) / ratios.length,
  };
}

/**
 * معدل البيع لكل أم في المزرعة — the same monthly sales figures, this time
 * against the size of the working herd on the 1st of that month, then averaged
 * month by month like computeLaggedSoldPerWeaning.
 *
 * Counting STARTS at the first month the farm sold anything. The months before
 * it are the ramp-up — does bought, mated, carrying, nursing, with nothing
 * weaned yet to sell — and scoring them as zeros measured the wait for the
 * first litter rather than how the farm sells. On a farm seven months into that
 * wait it dropped the average from 2.6 to 1.8. Once selling has begun a month
 * that sold nothing is still a real 0: that one IS a bad month, not a ramp-up.
 *
 * The herd size on a past date is NOT stored: Rabbit keeps a current status and
 * nothing else, so each doe's presence window is reconstructed from proxies the
 * report already relies on elsewhere. Both were chosen deliberately:
 *
 *   IN  — acquiredDate for a bought doe, otherwise her first mating. A
 *         farm-born doe joins the count when she enters service, not when she
 *         was born, so juveniles never inflate the denominator. A doe with
 *         neither date has never worked and is left out entirely.
 *   OUT — updatedAt once her status leaves "active", the same proxy «نافق
 *         الأمهات» uses. It moves forward if someone edits an old record, which
 *         is the known cost of having no exit date on the row.
 */
export type SalesPerDoe = {
  /** How many monthly figures went into the mean; also the printed denominator. */
  months: number;
  /** null until at least one month has both does and a full month of sales. */
  perDoe: number | null;
};

/** A doe's stay on the farm. `toMs` null means she is still here. */
export type DoePresence = { fromMs: number; toMs: number | null };

/**
 * How many does stood on the farm at `ms`. Exported so the البيع الشهري chart
 * can draw the same herd line these averages divide by — two answers to "how
 * many mothers were there in March" on one page would be indefensible.
 */
export function doesPresentOn(does: DoePresence[], ms: number): number {
  return does.filter((d) => d.fromMs <= ms && (d.toMs == null || d.toMs > ms)).length;
}

/**
 * Walks every scoreable month — from `firstMonth` up to but not including the
 * running one — handing back how many does stood on the 1st. Months with no
 * does at all are skipped rather than reported as 0: there is nothing to divide
 * by, which is not the same as having sold nothing.
 *
 * `firstMonth` is the caller's first selling month, NOT the first doe's
 * arrival. See computeSalesPerDoe for why the ramp-up is excluded.
 */
function forEachScoredMonth(
  does: DoePresence[],
  firstMonth: number | null,
  nowMs: number,
  visit: (month: number, present: number) => void
): void {
  if (firstMonth == null) return;
  const currentMonth = monthIndex(nowMs);

  // The running month is excluded for the same reason as the lagged average:
  // a few days of sales against a full herd would drag the mean down.
  for (let month = firstMonth; month < currentMonth; month++) {
    const monthStart = new Date(Math.floor(month / 12), month % 12, 1).getTime();
    const present = doesPresentOn(does, monthStart);
    if (present === 0) continue;
    visit(month, present);
  }
}

const mean = (ns: number[]) => ns.reduce((s, n) => s + n, 0) / ns.length;

/**
 * The month the farm first sold anything, or null if it never has. This is
 * where both per-doe averages start counting — see computeSalesPerDoe.
 */
function firstSellingMonth(soldByMonth: Map<number, { count: number } | number>): number | null {
  let first: number | null = null;
  for (const [month, v] of soldByMonth) {
    const count = typeof v === "number" ? v : v.count;
    if (count > 0 && (first == null || month < first)) first = month;
  }
  return first;
}

export function computeSalesPerDoe(
  sales: DatedCount[],
  does: DoePresence[],
  nowMs: number
): SalesPerDoe {
  const soldByMonth = new Map<number, number>();
  for (const s of sales) {
    const m = monthIndex(s.dateMs);
    soldByMonth.set(m, (soldByMonth.get(m) ?? 0) + s.count);
  }

  const ratios: number[] = [];
  forEachScoredMonth(does, firstSellingMonth(soldByMonth), nowMs, (month, present) => {
    // Sold nothing that month IS a zero: the mothers were standing there, and
    // the farm was already a selling farm by then.
    ratios.push((soldByMonth.get(month) ?? 0) / present);
  });

  if (ratios.length === 0) return { months: 0, perDoe: null };
  return { months: ratios.length, perDoe: mean(ratios) };
}

/**
 * متوسط الوزن المباع لكل أم شهريًا — the same month-by-month division as
 * computeSalesPerDoe, weighed in grams instead of counted in head. It answers
 * a different question: two farms can sell the same number of kits and ship
 * very different weights.
 *
 * weightGrams is nullable on KitStockMovement (the sale form requires it, but
 * imported and legacy rows may not carry it). A month that sold head with no
 * recorded weight at all is therefore UNKNOWN, not zero — scoring it 0 would
 * quietly drag the mean down — so it is dropped and counted in
 * unknownWeightMonths for the UI to disclose. A month that sold nothing still
 * scores a real 0.
 *
 * Starts at the same first selling month computeSalesPerDoe starts at, so the
 * head figure and the kilo figure always describe the same stretch of months.
 */
export type WeightPerDoe = {
  /** How many monthly figures went into the mean; also the printed denominator. */
  months: number;
  /** Grams per doe per month, null until one month is scoreable. */
  perDoeGrams: number | null;
  /** Months dropped because head were sold with no weight on the record. */
  unknownWeightMonths: number;
};

/** A sale with both its head count and its weight, so one can validate the other. */
export type DatedSale = { dateMs: number; count: number; grams: number };

export function computeWeightPerDoe(
  sales: DatedSale[],
  does: DoePresence[],
  nowMs: number
): WeightPerDoe {
  const byMonth = new Map<number, { count: number; grams: number }>();
  for (const s of sales) {
    const m = monthIndex(s.dateMs);
    const acc = byMonth.get(m) ?? { count: 0, grams: 0 };
    acc.count += s.count;
    acc.grams += s.grams;
    byMonth.set(m, acc);
  }

  const ratios: number[] = [];
  let unknownWeightMonths = 0;
  // Anchored on the first month that sold HEAD, not the first month with a
  // weight on file: the two averages have to cover the same months, or the
  // kilos would describe a different stretch of the farm's life than the count.
  forEachScoredMonth(does, firstSellingMonth(byMonth), nowMs, (month, present) => {
    const sold = byMonth.get(month);
    if (sold && sold.count > 0 && sold.grams === 0) {
      unknownWeightMonths += 1;
      return;
    }
    ratios.push((sold?.grams ?? 0) / present);
  });

  if (ratios.length === 0) return { months: 0, perDoeGrams: null, unknownWeightMonths };
  return { months: ratios.length, perDoeGrams: mean(ratios), unknownWeightMonths };
}

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

/**
 * Every field is lifetime — see the note on BreedingAverages.
 *
 * An object rather than positional arguments: the three scalars are all large
 * head counts, so a swapped pair would compile silently and quietly report the
 * balance as deaths.
 */
export type BreedingAveragesInput = {
  kindlings: AverageKindlingRow[];
  weanings: AverageWeaningRow[];
  /** نافق الفطام — post-weaning deaths, farm-level ledger total. */
  weanedStockDeaths: number;
  /** رصيد الفطام — the running balance, reported as-is. */
  remainingStock: number;
};

export function computeBreedingAverages({
  kindlings,
  weanings,
  weanedStockDeaths,
  remainingStock,
}: BreedingAveragesInput): BreedingAverages {
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
