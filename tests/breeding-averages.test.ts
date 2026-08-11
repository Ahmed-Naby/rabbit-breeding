import { describe, test, expect } from "vitest";
import {
  computeBreedingAverages,
  computeLaggedSoldPerWeaning,
  computeLittersPerDoeYear,
  computeMonthlySales,
  computeSalesPerDoe,
  computeWeightPerDoe,
  revenuePerDoeCents,
  type AverageKindlingRow,
  type AverageWeaningRow,
  type BreedingAveragesInput,
} from "@/lib/breeding-averages";

/** A litter whose nursing losses ARE knowable: bornDeadAtKindling >= 0. */
function litter(
  bornAliveAtKindling: number,
  bornDead: number,
  bornDeadAtKindling: number
): AverageKindlingRow {
  return { bornAliveAtKindling, bornDead, bornDeadAtKindling };
}

/** A litter predating the bornDeadAtKindling column — the -1 sentinel. */
function legacyLitter(bornAliveAtKindling: number, bornDead: number): AverageKindlingRow {
  return { bornAliveAtKindling, bornDead, bornDeadAtKindling: -1 };
}

function weaning(weaned: number | null): AverageWeaningRow {
  return { weaned };
}

/** computeBreedingAverages with everything the test does not care about zeroed. */
function averagesOf(input: Partial<BreedingAveragesInput>) {
  return computeBreedingAverages({
    kindlings: [],
    weanings: [],
    weanedStockDeaths: 0,
    remainingStock: 0,
    ...input,
  });
}

describe("computeBreedingAverages", () => {
  test("divides litter size by kindlings, and weaning figures by weanings", () => {
    const r = averagesOf({
      kindlings: [litter(8, 1, 1), litter(6, 0, 0)],
      weanings: [weaning(7), weaning(5)],
      weanedStockDeaths: 4,
      remainingStock: 30,
    });

    expect(r.kindlings).toBe(2);
    expect(r.weanings).toBe(2);
    expect(r.bornAlive).toBe(7); // (8 + 6) / 2
    expect(r.weaned).toBe(6); // (7 + 5) / 2
    expect(r.weanedStockDeaths).toBe(2); // 4 / 2
    // Never divided: a stock level has no denominator.
    expect(r.remainingStock).toBe(30);
  });

  test("takes lifetime rows, so a quiet week cannot empty the board", () => {
    // The caller passes every kindling and weaning the farm ever logged, never
    // the rows inside the selected period — a week with no kindling used to
    // print «÷ 0 ولادة» and «—» across the whole card.
    const r = averagesOf({
      kindlings: [litter(8, 0, 0), litter(6, 0, 0)],
      weanings: [weaning(7), weaning(5)],
      weanedStockDeaths: 4,
      remainingStock: 977,
    });

    expect(r.kindlings).toBe(2);
    expect(r.bornAlive).toBe(7);
    expect(r.remainingStock).toBe(977);
  });

  test("counts events, not does — a doe that kindled twice counts twice", () => {
    // The whole point of the event denominator: bornAlive stays a real litter
    // size (comparable to the breed standard) instead of doubling into
    // "kits produced per doe over the period".
    const r = averagesOf({
      kindlings: [litter(8, 0, 0), litter(6, 0, 0)],
      weanings: [weaning(7), weaning(5)],
      weanedStockDeaths: 6,
      remainingStock: 12,
    });

    expect(r.kindlings).toBe(2);
    expect(r.weanings).toBe(2);
    expect(r.bornAlive).toBe(7); // not 14
    expect(r.weaned).toBe(6);
    expect(r.weanedStockDeaths).toBe(3);
  });

  test("averages nursing deaths from the gap between bornDead and bornDeadAtKindling", () => {
    // First litter lost 3 while nursing (5 - 2), the second lost 1 (1 - 0).
    const r = averagesOf({ kindlings: [litter(9, 5, 2), litter(7, 1, 0)] });

    expect(r.nursingDeaths).toBe(2); // (3 + 1) / 2
    expect(r.nursingDeathsLitters).toBe(2);
    expect(r.unknownNursingLitters).toBe(0);
  });

  test("excludes legacy litters from BOTH sides of the nursing average rather than scoring them zero", () => {
    // Counting the legacy row as "lost nothing" would report 4/2 = 2.0 and
    // flatter the herd; excluding it reports the 4 losses we can actually see.
    const r = averagesOf({ kindlings: [litter(9, 6, 2), legacyLitter(7, 3)] });

    expect(r.nursingDeaths).toBe(4); // 4 / 1, not 4 / 2
    expect(r.nursingDeathsLitters).toBe(1);
    expect(r.unknownNursingLitters).toBe(1);
    // The excluded litter still counts toward litter size, which IS knowable.
    expect(r.kindlings).toBe(2);
    expect(r.bornAlive).toBe(8); // (9 + 7) / 2
  });

  test("returns null, not 0, for nursing deaths when every litter is legacy", () => {
    const r = averagesOf({ kindlings: [legacyLitter(8, 2), legacyLitter(6, 1)] });

    expect(r.nursingDeaths).toBeNull();
    expect(r.unknownNursingLitters).toBe(2);
    expect(r.bornAlive).toBe(7);
  });

  test("returns null for every average whose denominator is zero", () => {
    // A farm with stock on the books but not a single counted weaning yet.
    const r = averagesOf({ weanedStockDeaths: 9, remainingStock: 40 });

    expect(r.kindlings).toBe(0);
    expect(r.weanings).toBe(0);
    expect(r.bornAlive).toBeNull();
    expect(r.nursingDeaths).toBeNull();
    // نافق الفطام is farm-level but still divided — nothing to divide by, «—».
    expect(r.weanedStockDeaths).toBeNull();
    // The balance is exempt: it is a total, and 40 head are 40 head even in a
    // period that saw no weaning at all.
    expect(r.remainingStock).toBe(40);
  });

  test("the two denominators move independently", () => {
    // A litter born near the period end is never weaned inside it, so it must
    // not drag the weaning average down.
    const r = averagesOf({
      kindlings: [litter(8, 0, 0), litter(10, 0, 0)],
      weanings: [weaning(7)],
      weanedStockDeaths: 2,
      remainingStock: 20,
    });

    expect(r.kindlings).toBe(2);
    expect(r.weanings).toBe(1);
    expect(r.bornAlive).toBe(9);
    expect(r.weaned).toBe(7); // not 3.5
    expect(r.weanedStockDeaths).toBe(2);
    expect(r.remainingStock).toBe(20);
  });

  test("never counts a nursing correction as negative losses", () => {
    // «نافق» hand-edited downward below the frozen stillborn count: the frozen
    // value is the wrong one, and deadDuringBreeding floors at 0.
    const r = averagesOf({ kindlings: [litter(8, 1, 4)] });

    expect(r.nursingDeaths).toBe(0);
  });

});

describe("computeLaggedSoldPerWeaning", () => {
  /** Month `m` of 2025 (1-based), day 10 — safely inside the month. */
  const m = (month: number, count = 1) => ({
    dateMs: new Date(2025, month - 1, 10).getTime(),
    count,
  });
  /** «Now» inside month `month`, so months strictly before it are scoreable. */
  const nowIn = (month: number) => new Date(2025, month - 1, 15).getTime();

  test("scores each month against the weanings of the month before it", () => {
    // Jan: 2 weanings → Feb sells 10 → 5.0
    // Feb: 4 weanings → Mar sells 8  → 2.0   mean = 3.5
    const r = computeLaggedSoldPerWeaning(
      [m(2, 10), m(3, 8)],
      [m(1), m(1), m(2), m(2), m(2), m(2)],
      nowIn(4)
    );

    expect(r.months).toBe(2);
    expect(r.perWeaning).toBe(3.5);
  });

  test("averages the monthly figures unweighted — a big month counts once", () => {
    // Jan: 1 weaning → Feb sells 6 → 6.0
    // Feb: 100 weanings → Mar sells 100 → 1.0
    // Unweighted that is 3.5; pooling the totals would say 106/101 ≈ 1.05.
    const r = computeLaggedSoldPerWeaning(
      [m(2, 6), m(3, 100)],
      [m(1), ...Array.from({ length: 100 }, () => m(2))],
      nowIn(4)
    );

    expect(r.perWeaning).toBe(3.5);
  });

  test("counts a month that sold nothing as a real zero", () => {
    // Feb sold nothing after a January that weaned 2 litters. Dropping the
    // month would quietly flatter the farm.
    const r = computeLaggedSoldPerWeaning([m(3, 8)], [m(1), m(1), m(2), m(2)], nowIn(4));

    expect(r.months).toBe(2);
    expect(r.perWeaning).toBe(2); // (0 + 4) / 2
  });

  test("excludes the running month, which is only part of a month of sales", () => {
    // Sales so far in March would otherwise be divided by all of February's
    // weanings and drag the mean down every time the report is opened.
    const r = computeLaggedSoldPerWeaning([m(2, 10), m(3, 1)], [m(1), m(1), m(2)], nowIn(3));

    expect(r.months).toBe(1); // February only
    expect(r.perWeaning).toBe(5);
  });

  test("skips months whose predecessor weaned nothing instead of dividing by zero", () => {
    // A gap month: nothing weaned in February, so March is unscoreable.
    const r = computeLaggedSoldPerWeaning([m(2, 10), m(3, 99)], [m(1), m(1)], nowIn(5));

    expect(r.months).toBe(1);
    expect(r.perWeaning).toBe(5);
  });

  test("crosses the year boundary", () => {
    // December 2024's weanings must score January 2025's sales.
    const r = computeLaggedSoldPerWeaning(
      [{ dateMs: new Date(2025, 0, 10).getTime(), count: 12 }],
      [{ dateMs: new Date(2024, 11, 10).getTime(), count: 1 }],
      nowIn(3)
    );

    expect(r.months).toBe(1);
    expect(r.perWeaning).toBe(12);
  });

  test("returns «—» before any month can be scored", () => {
    const r = computeLaggedSoldPerWeaning([], [], nowIn(6));

    expect(r.months).toBe(0);
    expect(r.perWeaning).toBeNull();
  });
});

describe("computeSalesPerDoe", () => {
  /** Sales in month `month` of 2025 (1-based), day 10. */
  const sale = (month: number, count: number) => ({
    dateMs: new Date(2025, month - 1, 10).getTime(),
    count,
  });
  /** A doe present from the 1st of `from` until the 1st of `to` (exclusive). */
  const doe = (from: number, to?: number) => ({
    fromMs: new Date(2025, from - 1, 1).getTime(),
    toMs: to == null ? null : new Date(2025, to - 1, 1).getTime(),
  });
  const nowIn = (month: number) => new Date(2025, month - 1, 15).getTime();

  test("divides each month's sales by the does standing on the 1st", () => {
    // Jan: 2 does, 10 sold → 5.0
    // Feb: 2 does, 6 sold  → 3.0   mean = 4.0
    const r = computeSalesPerDoe([sale(1, 10), sale(2, 6)], [doe(1), doe(1)], nowIn(3));

    expect(r.months).toBe(2);
    expect(r.perDoe).toBe(4);
  });

  test("counts a doe from the 1st she is present, not before", () => {
    // The second doe joins mid-February, so she is absent on Feb 1 and only
    // counts from March — otherwise a doe bought yesterday would deflate
    // months she never worked.
    const does = [doe(1), { fromMs: new Date(2025, 1, 14).getTime(), toMs: null }];
    // Jan: 1 doe, 4 sold → 4.0 | Feb: 1 doe, 4 sold → 4.0 | Mar: 2 does, 4 → 2.0
    const r = computeSalesPerDoe([sale(1, 4), sale(2, 4), sale(3, 4)], does, nowIn(4));

    expect(r.months).toBe(3);
    expect(r.perDoe).toBe(10 / 3); // (4 + 4 + 2) / 3
  });

  test("drops a doe once she has left", () => {
    // She exits on Feb 1, so February is scored against the one doe left.
    const r = computeSalesPerDoe([sale(1, 10), sale(2, 10)], [doe(1), doe(1, 2)], nowIn(3));

    expect(r.perDoe).toBe(7.5); // (10/2 + 10/1) / 2
  });

  test("counts a month that sold nothing as a real zero", () => {
    // The does were standing there — dropping the month would flatter the farm.
    const r = computeSalesPerDoe([sale(1, 10)], [doe(1), doe(1)], nowIn(3));

    expect(r.months).toBe(2);
    expect(r.perDoe).toBe(2.5); // (5 + 0) / 2
  });

  test("skips a month with no does instead of dividing by zero", () => {
    // Imported history sells in January, but the first doe on record arrives in
    // March: January and February have no denominator at all, which is not the
    // same as having sold nothing.
    const r = computeSalesPerDoe([sale(1, 8), sale(3, 8)], [doe(3)], nowIn(4));

    expect(r.months).toBe(1);
    expect(r.perDoe).toBe(8);
  });

  test("starts at the first month with a sale, not at the first doe", () => {
    // Does bought in January, first sale in March: the intervening months are
    // the wait for the first litter to reach weight, not months the farm sold
    // badly. Scoring them 0 would measure the ramp-up instead of the selling.
    const r = computeSalesPerDoe([sale(3, 10), sale(4, 6)], [doe(1), doe(1)], nowIn(5));

    expect(r.months).toBe(2); // March and April only
    expect(r.perDoe).toBe(4); // (5 + 3) / 2
  });

  test("counts a barren month AFTER selling has begun as a real zero", () => {
    // The distinction the rule above turns on: once the farm has sold, a month
    // that ships nothing is a bad month and belongs in the average.
    const r = computeSalesPerDoe([sale(1, 10), sale(3, 10)], [doe(1), doe(1)], nowIn(4));

    expect(r.months).toBe(3); // Jan, the empty Feb, and Mar
    expect(r.perDoe).toBe(10 / 3); // (5 + 0 + 5) / 3
  });

  test("returns «—» for a farm that has never sold", () => {
    // Nothing to anchor on: a herd that has not sold yet has no selling rate,
    // which is not the same as a rate of zero.
    const r = computeSalesPerDoe([], [doe(1), doe(1)], nowIn(4));

    expect(r.months).toBe(0);
    expect(r.perDoe).toBeNull();
  });

  test("excludes the running month, which is only part of a month of sales", () => {
    const r = computeSalesPerDoe([sale(1, 10), sale(2, 1)], [doe(1), doe(1)], nowIn(2));

    expect(r.months).toBe(1); // January only
    expect(r.perDoe).toBe(5);
  });

  test("averages the monthly figures unweighted — a big herd counts once", () => {
    // Jan: 1 doe sells 6 → 6.0 | Feb: 100 does sell 100 → 1.0 → mean 3.5.
    // Pooling the totals would say 106/101 ≈ 1.05 instead.
    const does = [doe(1), ...Array.from({ length: 99 }, () => doe(2))];
    const r = computeSalesPerDoe([sale(1, 6), sale(2, 100)], does, nowIn(3));

    expect(r.perDoe).toBe(3.5);
  });

  test("crosses the year boundary", () => {
    const r = computeSalesPerDoe(
      [
        { dateMs: new Date(2024, 11, 10).getTime(), count: 6 },
        { dateMs: new Date(2025, 0, 10).getTime(), count: 12 },
      ],
      [{ fromMs: new Date(2024, 11, 1).getTime(), toMs: null }],
      nowIn(2)
    );

    expect(r.months).toBe(2); // December 2024 and January 2025
    expect(r.perDoe).toBe(9);
  });

  test("returns «—» for a farm with no does on record", () => {
    const r = computeSalesPerDoe([sale(1, 10)], [], nowIn(3));

    expect(r.months).toBe(0);
    expect(r.perDoe).toBeNull();
  });
});

describe("computeWeightPerDoe", () => {
  /** A sale in month `month` of 2025 (1-based): `count` head weighing `grams`. */
  const sale = (month: number, count: number, grams: number) => ({
    dateMs: new Date(2025, month - 1, 10).getTime(),
    count,
    grams,
  });
  const doe = (from: number, to?: number) => ({
    fromMs: new Date(2025, from - 1, 1).getTime(),
    toMs: to == null ? null : new Date(2025, to - 1, 1).getTime(),
  });
  const nowIn = (month: number) => new Date(2025, month - 1, 15).getTime();

  test("divides each month's weight by the does standing on the 1st", () => {
    // Jan: 2 does share 20 kg → 10 kg | Feb: 2 does share 12 kg → 6 kg
    const r = computeWeightPerDoe(
      [sale(1, 10, 20_000), sale(2, 6, 12_000)],
      [doe(1), doe(1)],
      nowIn(3)
    );

    expect(r.months).toBe(2);
    expect(r.perDoeGrams).toBe(8000); // (10000 + 6000) / 2
    expect(r.unknownWeightMonths).toBe(0);
  });

  test("drops a month whose sales carry no weight rather than scoring it zero", () => {
    // February sold 6 head with no weight on the record — unknown, not zero.
    // Scoring it 0 would halve the average on a data gap.
    const r = computeWeightPerDoe(
      [sale(1, 10, 20_000), sale(2, 6, 0)],
      [doe(1), doe(1)],
      nowIn(3)
    );

    expect(r.months).toBe(1);
    expect(r.perDoeGrams).toBe(10_000);
    expect(r.unknownWeightMonths).toBe(1);
  });

  test("counts a month that sold nothing at all as a real zero", () => {
    // No sale rows for February — the does were standing there and shipped
    // nothing, which is a genuine 0 and not the missing-weight case above.
    const r = computeWeightPerDoe([sale(1, 10, 20_000)], [doe(1), doe(1)], nowIn(3));

    expect(r.months).toBe(2);
    expect(r.perDoeGrams).toBe(5000); // (10000 + 0) / 2
    expect(r.unknownWeightMonths).toBe(0);
  });

  test("skips a month with no does instead of dividing by zero", () => {
    const r = computeWeightPerDoe([sale(3, 4, 8000)], [doe(3)], nowIn(4));

    expect(r.months).toBe(1);
    expect(r.perDoeGrams).toBe(8000);
  });

  test("excludes the running month", () => {
    const r = computeWeightPerDoe(
      [sale(1, 10, 20_000), sale(2, 1, 2000)],
      [doe(1), doe(1)],
      nowIn(2)
    );

    expect(r.months).toBe(1);
    expect(r.perDoeGrams).toBe(10_000);
  });

  test("starts at the first month with a sale, not at the first doe", () => {
    // Same rule as computeSalesPerDoe, so the kilos and the head describe the
    // same stretch of the farm's life.
    const r = computeWeightPerDoe([sale(3, 4, 8000)], [doe(1)], nowIn(5));

    expect(r.months).toBe(2); // March and the empty April
    expect(r.perDoeGrams).toBe(4000);
  });

  test("anchors on the first month that sold head, even with no weight on it", () => {
    // January sold with no weight recorded — unknown, so it is dropped from the
    // mean — but it is still where the farm started selling, so February's
    // barren follow-on month counts.
    const r = computeWeightPerDoe(
      [sale(1, 10, 0), sale(3, 5, 10_000)],
      [doe(1)],
      nowIn(4)
    );

    expect(r.unknownWeightMonths).toBe(1);
    expect(r.months).toBe(2); // the empty February and March
    expect(r.perDoeGrams).toBe(5000); // (0 + 10000) / 2
  });

  test("returns «—» for a farm with no does on record", () => {
    const r = computeWeightPerDoe([sale(1, 10, 20_000)], [], nowIn(3));

    expect(r.months).toBe(0);
    expect(r.perDoeGrams).toBeNull();
  });
});

describe("computeLittersPerDoeYear", () => {
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();
  /** `count` litters on one day. */
  const kindled = (y: number, m: number, d: number, count = 1) => ({ dateMs: at(y, m, d), count });
  const doe = (from: number, to: number | null = null) => ({ fromMs: from, toMs: to });
  // Mid-January 2026, so the window every case below closes on is 1 Jan 2026 —
  // and 2025 is exactly 365 days, which makes a doe standing all of it one
  // doe-year on the nose.
  const now = at(2026, 1, 15);
  const year2025 = [doe(at(2025, 1, 1))];

  test("annualises litters over the doe-years they were produced in", () => {
    const r = computeLittersPerDoeYear(
      [1, 4, 7, 10, 12].map((m) => kindled(2025, m, 1)),
      year2025,
      now
    );

    expect(r.doeYears).toBeCloseTo(1, 6);
    expect(r.litters).toBe(5);
    expect(r.perYear).toBeCloseTo(5, 6);
  });

  test("keeps an idle doe in the denominator", () => {
    // The whole point of a doe-time denominator: the doe that never kindled is
    // exactly the one an average of kindling INTERVALS would silently drop.
    const r = computeLittersPerDoeYear(
      [1, 4, 7, 10, 12].map((m) => kindled(2025, m, 1)),
      [doe(at(2025, 1, 1)), doe(at(2025, 1, 1))],
      now
    );

    expect(r.doeYears).toBeCloseTo(2, 6);
    expect(r.perYear).toBeCloseTo(2.5, 6); // not the 5 the one worker alone would give
  });

  test("starts at the first litter, not at the first doe", () => {
    // Does bought in January, first litter in July: the wait for it is not
    // months the farm bred badly. 1 Jul → 1 Jan is 184 days.
    const r = computeLittersPerDoeYear(
      [kindled(2025, 7, 1), kindled(2025, 9, 1), kindled(2025, 11, 1)],
      year2025,
      now
    );

    // 3 decimals, not 6: a span crossing a single daylight-saving change is an
    // hour short of the calendar days it covers. That hour is 0.01% of the
    // figure and nothing the reader could see, but it is not zero.
    expect(r.doeYears).toBeCloseTo(184 / 365, 3);
    expect(r.litters).toBe(3);
    expect(r.perYear).toBeCloseTo(3 / (184 / 365), 2);
  });

  test("counts a doe to the day she arrived, not to the 1st of her month", () => {
    // The month-bucket denominator this replaced rounded her twelve days down
    // to nothing, and so overstated every farm that was still buying does.
    const r = computeLittersPerDoeYear(
      [kindled(2025, 1, 1)],
      [doe(at(2025, 1, 1)), doe(at(2025, 12, 20))],
      now
    );

    expect(r.doeYears).toBeCloseTo(1 + 12 / 365, 6);
  });

  test("keeps a doe who has since left, for exactly the stretch she stood", () => {
    // 1 Jan → 1 Jul is 181 days. Her litters are in the numerator, so her
    // months must be in the denominator.
    const r = computeLittersPerDoeYear(
      [kindled(2025, 1, 1)],
      [doe(at(2025, 1, 1)), doe(at(2025, 1, 1), at(2025, 7, 1))],
      now
    );

    expect(r.doeYears).toBeCloseTo(1 + 181 / 365, 3); // see the DST note above
  });

  test("leaves the running month out, litters and doe-days alike", () => {
    // Half a month of kindlings against a full month of does would understate
    // the farm every time the report is opened.
    const r = computeLittersPerDoeYear(
      [kindled(2025, 1, 1), kindled(2026, 1, 5)],
      year2025,
      now
    );

    expect(r.litters).toBe(1);
    expect(r.doeYears).toBeCloseTo(1, 6);
    expect(r.perYear).toBeCloseTo(1, 6);
  });

  test("returns «—» for a farm with no does on record", () => {
    const r = computeLittersPerDoeYear([kindled(2025, 1, 1, 3)], [], now);

    expect(r.doeYears).toBe(0);
    expect(r.perYear).toBeNull();
  });

  test("returns «—» while the farm is still inside its first kindling month", () => {
    const r = computeLittersPerDoeYear([kindled(2026, 1, 3)], year2025, now);

    expect(r.perYear).toBeNull();
  });
});

describe("computeMonthlySales", () => {
  /** A sale of `count` head in month `m` of 2025 (1-based). */
  const sold = (m: number, count: number) => ({ dateMs: new Date(2025, m - 1, 12).getTime(), count });
  const now = new Date(2025, 6, 5).getTime(); // 5 July 2025 — June is the last full month.

  test("divides by exactly the month count it reports", () => {
    // The UI prints «÷ N شهر» beside the quotient; the reader must be able to
    // reproduce the number shown from the two figures on screen.
    const r = computeMonthlySales([sold(1, 300), sold(2, 100), sold(3, 200)], now);
    expect(r.months).toBe(6);
    expect(r.totalSold).toBe(600);
    expect(r.perMonth).toBe(100);
  });

  test("counts from the first month with a sale, not from the farm's first event", () => {
    // Selling starts in April: three months (April, May, June), 900 head → 300.
    // Counting the silent ramp-up months would have printed 150.
    const r = computeMonthlySales([sold(4, 500), sold(5, 400)], now);
    expect(r.months).toBe(3);
    expect(r.perMonth).toBe(300);
  });

  test("counts a barren month after selling has begun as a real zero", () => {
    const r = computeMonthlySales([sold(5, 300), sold(6, 300)], new Date(2025, 7, 5).getTime());
    // May, June, July — July sold nothing, and that is a bad month, not missing data.
    expect(r.months).toBe(3);
    expect(r.perMonth).toBe(200);
  });

  test("leaves the running month out", () => {
    // July's few days are not a month's selling and would drag the mean down
    // every time the report is opened.
    const r = computeMonthlySales([sold(6, 300), sold(7, 20)], now);
    expect(r.months).toBe(1);
    expect(r.perMonth).toBe(300);
  });

  test("returns «—» for a farm that has never sold", () => {
    const r = computeMonthlySales([], now);
    expect(r.months).toBe(0);
    expect(r.perMonth).toBeNull();
  });

  test("returns «—» while the farm is still inside its first selling month", () => {
    const r = computeMonthlySales([sold(7, 40)], now);
    expect(r.months).toBe(0);
    expect(r.perMonth).toBeNull();
  });

  test("crosses the year boundary", () => {
    const r = computeMonthlySales(
      [
        { dateMs: new Date(2024, 11, 10).getTime(), count: 6 },
        { dateMs: new Date(2025, 0, 10).getTime(), count: 12 },
      ],
      new Date(2025, 1, 5).getTime()
    );
    expect(r.months).toBe(2);
    expect(r.perMonth).toBe(9);
  });
});

describe("revenuePerDoeCents", () => {
  test("values the kilos at the settings price", () => {
    // 2.4 kg × 8000 قرش/كجم = 19200
    expect(revenuePerDoeCents(2400, 8000)).toBe(19200);
  });

  test("rounds to whole cents", () => {
    expect(revenuePerDoeCents(333, 999)).toBe(333);
  });

  test("is «—» while the price setting is still unset", () => {
    expect(revenuePerDoeCents(2400, 0)).toBeNull();
  });

  test("is «—» when the weight itself is unknown", () => {
    expect(revenuePerDoeCents(null, 8000)).toBeNull();
  });
});
