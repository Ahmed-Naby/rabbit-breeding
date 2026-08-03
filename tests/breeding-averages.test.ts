import { describe, test, expect } from "vitest";
import {
  computeBreedingAverages,
  computeLaggedSoldPerWeaning,
  computeMonthlySales,
  computeSalesPerDoe,
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
    // The farm's first doe arrives in March; January and February have no
    // denominator at all, which is not the same as having sold nothing.
    const r = computeSalesPerDoe([sale(3, 8)], [doe(3)], nowIn(4));

    expect(r.months).toBe(1);
    expect(r.perDoe).toBe(8);
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
      [{ dateMs: new Date(2025, 0, 10).getTime(), count: 12 }],
      [{ fromMs: new Date(2024, 11, 1).getTime(), toMs: null }],
      nowIn(2)
    );

    expect(r.months).toBe(2); // December 2024 (0 sold) and January 2025
    expect(r.perDoe).toBe(6);
  });

  test("returns «—» for a farm with no does on record", () => {
    const r = computeSalesPerDoe([sale(1, 10)], [], nowIn(3));

    expect(r.months).toBe(0);
    expect(r.perDoe).toBeNull();
  });
});

describe("computeMonthlySales", () => {
  const DAY = 86_400_000;
  const start = Date.UTC(2025, 0, 1);
  const after = (days: number) => start + days * DAY;

  test("spreads lifetime sales over the months the farm has run", () => {
    // ~12 months in, 2400 sold → 200 a month.
    const r = computeMonthlySales(2400, start, after(365));
    expect(r.months).toBe(12);
    expect(r.perMonth).toBe(200);
    expect(r.totalSold).toBe(2400);
  });

  test("divides by exactly the month count it reports", () => {
    // The UI prints «÷ N شهر» beside the quotient; if the function divided by
    // an unrounded span, the reader could not reproduce the number shown.
    const r = computeMonthlySales(1000, start, after(400));
    expect(r.perMonth).toBe(1000 / r.months);
  });

  test("counts from the farm's first event, not its first sale", () => {
    // Three silent months then 300 sold in the fourth is 75/month over its
    // life, not 300 — the caller passes the first weaning, and this is why.
    const r = computeMonthlySales(300, start, after(121));
    expect(r.months).toBe(4);
    expect(r.perMonth).toBe(75);
  });

  test("never divides by a fraction of a month", () => {
    // A farm two weeks old with 50 sold has not proven a 100/month rate.
    const r = computeMonthlySales(50, start, after(14));
    expect(r.months).toBe(1);
    expect(r.perMonth).toBe(50);
  });

  test("returns «—» rather than a rate for a farm with no history", () => {
    const r = computeMonthlySales(0, null, after(0));
    expect(r.months).toBe(0);
    expect(r.perMonth).toBeNull();
  });

  test("reports zero, not «—», for a farm that has sold nothing yet", () => {
    // It has run for months and sold none — that is a real 0, not missing data.
    const r = computeMonthlySales(0, start, after(90));
    expect(r.perMonth).toBe(0);
  });
});
