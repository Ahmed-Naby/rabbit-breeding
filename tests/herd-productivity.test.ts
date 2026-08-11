import { describe, test, expect } from "vitest";
import { computeHerdProductivity, type HerdProductivityInput } from "@/lib/herd-productivity";

const ms = (y: number, m: number, d = 15) => new Date(y, m - 1, d).getTime();

/** A doe standing from `from` onwards, still active unless `to` is given. */
const doe = (from: number, to: number | null = null) => ({ fromMs: from, toMs: to });

/**
 * computeHerdProductivity with everything the monthly tiles do not read zeroed.
 * The period defaults to the whole of 2025, so every month of it is scorable.
 */
function productivityOf(input: Partial<HerdProductivityInput>) {
  return computeHerdProductivity({
    doeCount: 0,
    periodDays: 365,
    does: [],
    fromMs: ms(2025, 1, 1),
    toMs: ms(2026, 1, 1),
    weaningEvents: [],
    saleEvents: [],
    incomeEvents: [],
    expenseEvents: [],
    cycleDays: 60,
    targetCyclesPerYear: 6,
    kindlings: [],
    weanings: [],
    soldCount: 0,
    soldWeightGrams: 0,
    incomeCents: 0,
    expenseCents: 0,
    soldAmountCents: 0,
    feedExpenseCents: 0,
    feedPricePerTonCents: 0,
    ...input,
  });
}

describe("«العائد الشهري لكل أم» — the month-by-month mean", () => {
  test("divides each month by the does standing that month, then averages", () => {
    // Jan: 20 head ÷ 2 does = 10. Feb: 30 ÷ 3 = 10 (a third doe arrives).
    // The pooled rule would have said 50 ÷ 3 = 16.7, which is the bug this fixes.
    const r = productivityOf({
      does: [doe(ms(2024, 12, 1)), doe(ms(2024, 12, 1)), doe(ms(2025, 2, 1))],
      fromMs: ms(2025, 1, 1),
      toMs: ms(2025, 3, 1),
      weaningEvents: [
        { dateMs: ms(2025, 1), value: 20 },
        { dateMs: ms(2025, 2), value: 30 },
      ],
    });
    expect(r.weanedPerDoePerMonth).toBeCloseTo(10, 6);
  });

  test("starts at the first month with activity, not at the first doe", () => {
    // The does stand from January but nothing is weaned until March. Counting
    // the two ramp-up months would print 20/4 = 5 instead of the true 10.
    const r = productivityOf({
      does: [doe(ms(2024, 12, 1)), doe(ms(2024, 12, 1))],
      fromMs: ms(2025, 1, 1),
      toMs: ms(2025, 5, 1),
      weaningEvents: [
        { dateMs: ms(2025, 3), value: 30 },
        { dateMs: ms(2025, 4), value: 10 },
      ],
    });
    expect(r.weanedPerDoePerMonth).toBeCloseTo(10, 6);
  });

  test("counts a barren month after the first activity as a real zero", () => {
    const r = productivityOf({
      does: [doe(ms(2024, 12, 1))],
      fromMs: ms(2025, 1, 1),
      toMs: ms(2025, 4, 1),
      weaningEvents: [
        { dateMs: ms(2025, 1), value: 9 },
        { dateMs: ms(2025, 3), value: 3 },
      ],
    });
    expect(r.weanedPerDoePerMonth).toBeCloseTo(4, 6);
  });

  test("skips a month with no does rather than scoring it as zero", () => {
    // The doe only arrives in February, so January has no denominator at all.
    const r = productivityOf({
      does: [doe(ms(2025, 2, 1))],
      fromMs: ms(2025, 1, 1),
      toMs: ms(2025, 3, 1),
      weaningEvents: [{ dateMs: ms(2025, 2), value: 7 }],
    });
    expect(r.weanedPerDoePerMonth).toBeCloseTo(7, 6);
  });

  test("scores only calendar months wholly inside the period", () => {
    // Jan is entered mid-month and Mar is left mid-month, so only February —
    // 12 ÷ 2 = 6 — is a month the farm was fully observed for.
    const r = productivityOf({
      does: [doe(ms(2024, 12, 1)), doe(ms(2024, 12, 1))],
      fromMs: ms(2025, 1, 10),
      toMs: ms(2025, 3, 10),
      weaningEvents: [
        { dateMs: ms(2025, 1, 20), value: 100 },
        { dateMs: ms(2025, 2, 5), value: 12 },
        { dateMs: ms(2025, 3, 5), value: 100 },
      ],
    });
    expect(r.weanedPerDoePerMonth).toBeCloseTo(6, 6);
  });

  test("returns «—», not zero, when no complete month qualifies", () => {
    const r = productivityOf({
      does: [doe(ms(2024, 12, 1))],
      fromMs: ms(2025, 1, 10),
      toMs: ms(2025, 1, 25),
      weaningEvents: [{ dateMs: ms(2025, 1, 20), value: 8 }],
    });
    expect(r.weanedPerDoePerMonth).toBeNull();
  });

  test("crosses the year boundary", () => {
    const r = productivityOf({
      does: [doe(ms(2024, 1, 1))],
      fromMs: ms(2024, 12, 1),
      toMs: ms(2025, 2, 1),
      weaningEvents: [
        { dateMs: ms(2024, 12), value: 6 },
        { dateMs: ms(2025, 1), value: 12 },
      ],
    });
    expect(r.weanedPerDoePerMonth).toBeCloseTo(9, 6);
  });

  test("anchors kilos on the first month that sold head, even with no weight typed", () => {
    // February shipped 5 rabbits with no weight on the row. It is still the
    // month the farm started selling, so March's kilos are averaged with a 0.
    const r = productivityOf({
      does: [doe(ms(2024, 12, 1))],
      fromMs: ms(2025, 1, 1),
      toMs: ms(2025, 4, 1),
      saleEvents: [
        { dateMs: ms(2025, 2), count: 5, grams: 0 },
        { dateMs: ms(2025, 3), count: 4, grams: 8000 },
      ],
    });
    expect(r.kgSoldPerDoePerMonth).toBeCloseTo(4, 6);
  });

  test("nets income against expenses on a shared money anchor", () => {
    const r = productivityOf({
      does: [doe(ms(2024, 12, 1)), doe(ms(2024, 12, 1))],
      fromMs: ms(2025, 1, 1),
      toMs: ms(2025, 3, 1),
      incomeEvents: [
        { dateMs: ms(2025, 1), value: 20_000 },
        { dateMs: ms(2025, 2), value: 30_000 },
      ],
      expenseEvents: [{ dateMs: ms(2025, 2), value: 10_000 }],
    });
    expect(r.revenuePerDoePerMonthCents).toBeCloseTo(12_500, 6);
    // Jan spent nothing — a real zero, because the money months had begun.
    expect(r.costPerDoePerMonthCents).toBeCloseTo(2_500, 6);
    expect(r.netPerDoePerMonthCents).toBeCloseTo(10_000, 6);
  });
});

describe("«دورات فعلية لكل أم في السنة» — the doe-year denominator", () => {
  const litter = (dateMs = ms(2025, 6)) => ({ dateMs });
  /** `n` litters, all inside the default 2025 period. */
  const litters = (n: number, dateMs?: number) =>
    Array.from({ length: n }, () => litter(dateMs));

  test("divides by doe-years stood, so a full year of one doe is her own rate", () => {
    const r = productivityOf({
      doeCount: 1,
      does: [doe(ms(2025, 1, 1))],
      kindlings: litters(5),
    });
    // 5 litters ÷ 1 doe-year. 2025 is 365 days, so the doe-year is exactly 1.
    expect(r.doeYears).toBeCloseTo(1, 2);
    expect(r.cyclesPerDoePerYear).toBeCloseTo(5, 2);
  });

  test("charges a doe only for the part of the period she stood", () => {
    // One doe all year, one arriving at the halfway mark: 1.5 doe-years, not 2.
    const r = productivityOf({
      doeCount: 2,
      does: [doe(ms(2025, 1, 1)), doe(ms(2025, 7, 2))],
      kindlings: litters(6),
    });
    expect(r.doeYears).toBeCloseTo(1.5, 1);
    expect(r.cyclesPerDoePerYear).toBeCloseTo(4, 1);
  });

  test("keeps a doe who has since left, because her litters are still counted", () => {
    // The head-count denominator dropped her entirely and printed 6 cycles for
    // a farm that ran two does for half a year each.
    const r = productivityOf({
      doeCount: 1,
      does: [doe(ms(2025, 1, 1)), doe(ms(2025, 1, 1), ms(2025, 7, 2))],
      kindlings: litters(6),
    });
    expect(r.doeYears).toBeCloseTo(1.5, 1);
    expect(r.cyclesPerDoePerYear).toBeCloseTo(4, 1);
  });

  test("clips a stay that started before the period to the period itself", () => {
    const r = productivityOf({
      doeCount: 1,
      does: [doe(ms(2020, 1, 1))],
      kindlings: litters(3),
    });
    expect(r.doeYears).toBeCloseTo(1, 2);
    expect(r.cyclesPerDoePerYear).toBeCloseTo(3, 2);
  });

  test("annualises a short window without a separate scaling step", () => {
    // One doe for one month with one litter reads as 12 cycles a year.
    const r = productivityOf({
      doeCount: 1,
      periodDays: 31,
      does: [doe(ms(2025, 1, 1))],
      fromMs: ms(2025, 1, 1),
      toMs: ms(2025, 2, 1),
      kindlings: litters(1, ms(2025, 1, 15)),
    });
    expect(r.cyclesPerDoePerYear).toBeCloseTo(365 / 31, 2);
  });

  test("stops at the start of the running month, litters and doe-days alike", () => {
    // A period ending mid-January has accrued January's cage time but almost
    // none of the litters it will produce. Dropping it is what makes this
    // agree with «عدد البطون في السنة», which has always dropped it.
    const r = productivityOf({
      doeCount: 1,
      does: [doe(ms(2025, 1, 1))],
      fromMs: ms(2025, 1, 1),
      toMs: ms(2026, 1, 20),
      kindlings: [...litters(5), litter(ms(2026, 1, 10))],
    });
    expect(r.doeYears).toBeCloseTo(1, 2); // 2025 only, not the 20 extra days
    expect(r.cyclesPerDoePerYear).toBeCloseTo(5, 2); // the January litter is out
  });

  test("keeps the running month when the caller asked for that month alone", () => {
    // «كيف يسير هذا الشهر؟» is a deliberate question and must get a number,
    // not the «—» that clamping a one-month window to nothing would give.
    const r = productivityOf({
      doeCount: 1,
      periodDays: 20,
      does: [doe(ms(2024, 1, 1))],
      fromMs: ms(2025, 1, 1),
      toMs: ms(2025, 1, 21),
      kindlings: litters(1, ms(2025, 1, 10)),
    });
    expect(r.cyclesPerDoePerYear).toBeCloseTo(365 / 20, 1);
  });

  test("is «—», not 0, when no doe stood in the period at all", () => {
    const r = productivityOf({ doeCount: 3, does: [], kindlings: litters(1) });
    expect(r.doeYears).toBeNull();
    expect(r.cyclesPerDoePerYear).toBeNull();
  });
});
