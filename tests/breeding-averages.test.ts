import { describe, test, expect } from "vitest";
import {
  computeBreedingAverages,
  computeMonthlySales,
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
    totalSold: 0,
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
      totalSold: 9,
    });

    expect(r.kindlings).toBe(2);
    expect(r.weanings).toBe(2);
    expect(r.bornAlive).toBe(7); // (8 + 6) / 2
    expect(r.weaned).toBe(6); // (7 + 5) / 2
    expect(r.weanedStockDeaths).toBe(2); // 4 / 2
    // Sales share the weaning denominator, so it pairs with `weaned` above.
    expect(r.soldPerWeaning).toBe(4.5); // 9 / 2
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
    const r = averagesOf({ weanedStockDeaths: 9, remainingStock: 40, totalSold: 5 });

    expect(r.kindlings).toBe(0);
    expect(r.weanings).toBe(0);
    expect(r.bornAlive).toBeNull();
    expect(r.nursingDeaths).toBeNull();
    // نافق الفطام is farm-level but still divided — nothing to divide by, «—».
    expect(r.weanedStockDeaths).toBeNull();
    // Same for sales: 5 head sold out of stock that predates any weaning here.
    expect(r.soldPerWeaning).toBeNull();
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

  test("reports sales per litter below weaned per litter while stock is unsold", () => {
    // The realistic shape: 2 litters weaned 12 head, 8 have been sold and 4 are
    // still standing. The 6.0/4.0 gap is the balance, not a loss — the note
    // under the card exists to say so.
    const r = averagesOf({
      weanings: [weaning(7), weaning(5)],
      totalSold: 8,
      remainingStock: 4,
    });

    expect(r.weaned).toBe(6);
    expect(r.soldPerWeaning).toBe(4);
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
