import { describe, test, expect } from "vitest";
import {
  buildKitStockSeries,
  buildMonthlySalesSeries,
  movementDelta,
  pickBucket,
  type KitStockEvent,
} from "@/lib/kit-stock-series";

const DAY = 86_400_000;
const at = (dayOffset: number, delta: number): KitStockEvent => ({
  dateMs: Date.UTC(2026, 0, 1) + dayOffset * DAY,
  delta,
});
const now = (dayOffset: number) => Date.UTC(2026, 0, 1) + dayOffset * DAY;
const last = <T>(xs: T[]) => xs[xs.length - 1];

describe("movementDelta", () => {
  test("mirrors the signs getKitStockBalanceAsOf uses", () => {
    expect(movementDelta("returned", 5)).toBe(5);
    // A signed manual correction: stored negative stays negative.
    expect(movementDelta("adjustment", -3)).toBe(-3);
    expect(movementDelta("sale", 20)).toBe(-20);
    expect(movementDelta("death", 4)).toBe(-4);
    expect(movementDelta("retained", 2)).toBe(-2);
  });

  test("leaves the balance alone for a type it does not know", () => {
    // A new movement type shipped to the DB before this file learns about it
    // should not silently push the curve in a guessed direction.
    expect(movementDelta("teleported", 9)).toBe(0);
  });
});

describe("pickBucket", () => {
  test("stays daily while the farm is young", () => {
    expect(pickBucket(30 * DAY)).toBe("day");
    expect(pickBucket(59 * DAY)).toBe("day");
  });

  test("widens to weekly, then monthly, as history piles up", () => {
    expect(pickBucket(60 * DAY)).toBe("week");
    expect(pickBucket(413 * DAY)).toBe("week");
    expect(pickBucket(414 * DAY)).toBe("month");
  });
});

describe("buildKitStockSeries", () => {
  test("replays events as a running total, not a per-bucket sum", () => {
    const { points } = buildKitStockSeries([at(0, 30), at(1, -10), at(2, 5)], now(3));
    expect(points.map((p) => p.balance)).toEqual([30, 20, 25, 25]);
  });

  test("ends on the current balance, so the curve agrees with the رصيد card", () => {
    const events = [at(0, 100), at(5, -40), at(9, 12)];
    const { points } = buildKitStockSeries(events, now(10));
    expect(last(points).balance).toBe(72);
    expect(last(points).dateMs).toBe(now(10));
  });

  test("counts events dated in the future into the final balance", () => {
    // Back-dating works both ways: a sale entered with tomorrow's date must not
    // fall off the end of the series.
    const { points } = buildKitStockSeries([at(0, 50), at(20, -10)], now(3));
    expect(last(points).balance).toBe(40);
  });

  test("keeps flat buckets rather than skipping them", () => {
    // Nothing happened between day 0 and day 4 — that is information.
    const { points } = buildKitStockSeries([at(0, 8), at(4, -3)], now(4));
    expect(points.map((p) => p.balance)).toEqual([8, 8, 8, 8, 5]);
  });

  test("caps the point count once the span outgrows daily resolution", () => {
    const { points, bucket } = buildKitStockSeries([at(0, 1000)], now(413));
    expect(bucket).toBe("week");
    expect(points.length).toBeLessThanOrEqual(60);
    expect(last(points).balance).toBe(1000);
  });

  test("returns nothing to draw for a farm with no weanings yet", () => {
    expect(buildKitStockSeries([], now(0))).toEqual({ points: [], bucket: "month" });
  });

  test("does not depend on the caller sorting its events", () => {
    const shuffled = [at(2, 5), at(0, 30), at(1, -10)];
    expect(buildKitStockSeries(shuffled, now(3)).points.map((p) => p.balance)).toEqual([
      30, 20, 25, 25,
    ]);
  });
});

describe("buildMonthlySalesSeries", () => {
  /** A sale of `count` head on the 10th of month `month` in 2025 (1-based). */
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
  const counts = (points: { count: number }[]) => points.map((p) => p.count);

  test("sums every sale in a calendar month into one bar", () => {
    const points = buildMonthlySalesSeries(
      [sale(1, 30), sale(1, 12), sale(2, 40)],
      [],
      nowIn(3)
    );

    expect(counts(points)).toEqual([42, 40]);
    expect(new Date(points[0].monthMs).getDate()).toBe(1);
  });

  test("emits a zero bar for a month that sold nothing", () => {
    // Skipping February would put January and March side by side and make a
    // quiet month look like it never happened.
    const points = buildMonthlySalesSeries([sale(1, 30), sale(3, 20)], [], nowIn(4));

    expect(counts(points)).toEqual([30, 0, 20]);
  });

  test("leaves out the running month, which is only part of a month", () => {
    const points = buildMonthlySalesSeries([sale(1, 30), sale(2, 3)], [], nowIn(2));

    expect(counts(points)).toEqual([30]);
  });

  test("starts at the first sale, not at the first of the year", () => {
    const points = buildMonthlySalesSeries([sale(5, 30)], [], nowIn(7));

    expect(points).toHaveLength(2); // May and June
    expect(new Date(points[0].monthMs).getMonth()).toBe(4);
  });

  test("leaves out the ramp-up months before the first sale", () => {
    // Does standing since February, first sale in May. computeSalesPerDoe
    // starts averaging in May too, so the figures drawn over these bars
    // average to exactly what the «معدل البيع لكل أم» card shows.
    const points = buildMonthlySalesSeries([sale(5, 30)], [doe(2)], nowIn(7));

    expect(new Date(points[0].monthMs).getMonth()).toBe(4); // May
    expect(counts(points)).toEqual([30, 0]);
  });

  test("does not let a sale row of zero head open the series", () => {
    // A 0-head row is not a selling month to computeSalesPerDoe either; opening
    // on it would put a bar on the chart the card never averaged.
    const points = buildMonthlySalesSeries([sale(1, 0), sale(3, 30)], [doe(1)], nowIn(4));

    expect(new Date(points[0].monthMs).getMonth()).toBe(2); // March
    expect(counts(points)).toEqual([30]);
  });

  test("crosses the year boundary", () => {
    const points = buildMonthlySalesSeries(
      [{ dateMs: new Date(2024, 10, 10).getTime(), count: 5 }, sale(1, 7)],
      [],
      nowIn(2)
    );

    expect(counts(points)).toEqual([5, 0, 7]); // Nov, Dec 2024, Jan 2025
  });

  test("returns nothing for a farm that has never sold", () => {
    expect(buildMonthlySalesSeries([], [], nowIn(6))).toEqual([]);
  });

  test("returns nothing when every sale is in the incomplete running month", () => {
    // One partial month is not a chart — the card shows its empty text instead.
    expect(buildMonthlySalesSeries([sale(6, 12)], [], nowIn(6))).toEqual([]);
  });

  test("counts the does standing on the 1st of each month", () => {
    // A doe arriving mid-February is absent on Feb 1 and present on Mar 1 —
    // the same rule computeSalesPerDoe divides by, so a reader can take one
    // bar over the other and land on «معدل البيع لكل أم».
    const does = [doe(1), { fromMs: new Date(2025, 1, 14).getTime(), toMs: null }];
    const points = buildMonthlySalesSeries([sale(1, 30)], does, nowIn(4));

    expect(points.map((p) => p.does)).toEqual([1, 1, 2]);
  });

  test("drops a doe from the months after she leaves", () => {
    const points = buildMonthlySalesSeries([sale(1, 30)], [doe(1), doe(1, 3)], nowIn(4));

    expect(points.map((p) => p.does)).toEqual([2, 2, 1]);
  });

  test("reports zero does rather than skipping the month", () => {
    // The bar still belongs on the axis: a month with sales and no does on
    // file is a data problem worth seeing, not a month to hide.
    const points = buildMonthlySalesSeries([sale(1, 30)], [doe(3)], nowIn(4));

    expect(points.map((p) => p.does)).toEqual([0, 0, 1]);
    expect(counts(points)).toEqual([30, 0, 0]);
  });

  /** A stock event of `delta` head on the 5th of month `month` in 2025. */
  const move = (month: number, delta: number): KitStockEvent => ({
    dateMs: new Date(2025, month - 1, 5).getTime(),
    delta,
  });

  test("closes each month on the balance standing at its end", () => {
    // +50 in January, -30 in February: the line reads 50 over the January bar
    // and 20 over February's, not the other way round.
    const points = buildMonthlySalesSeries(
      [sale(1, 30)],
      [],
      nowIn(3),
      [move(1, 50), move(2, -30)]
    );

    expect(points.map((p) => p.balance)).toEqual([50, 20]);
  });

  test("carries in what was standing before the first bar", () => {
    // The farm weaned in January and did not sell until March. The March bar
    // opens on stock that already existed, so the line must not restart at 0.
    const points = buildMonthlySalesSeries([sale(3, 10)], [], nowIn(4), [move(1, 40)]);

    expect(points.map((p) => p.balance)).toEqual([40]);
  });

  test("holds the level through a month with no movement at all", () => {
    const points = buildMonthlySalesSeries([sale(1, 10)], [], nowIn(4), [move(1, 25)]);

    expect(points.map((p) => p.balance)).toEqual([25, 25, 25]);
  });

  test("leaves the balance null when no events are given", () => {
    // The chart draws no line rather than a flat zero, which would read as an
    // empty barn instead of an unanswered question.
    const points = buildMonthlySalesSeries([sale(1, 30)], [], nowIn(3));

    expect(points.map((p) => p.balance)).toEqual([null, null]);
  });

  test("agrees with the balance curve on the same events", () => {
    // Both are replays of one event list, so the last month's close must equal
    // what buildKitStockSeries carries into today.
    const events = [move(1, 60), move(2, -25), move(3, -10)];
    const points = buildMonthlySalesSeries([sale(1, 30)], [], nowIn(4), events);
    const { points: curve } = buildKitStockSeries(events, nowIn(4));

    expect(points[points.length - 1].balance).toBe(curve[curve.length - 1].balance);
  });
});
