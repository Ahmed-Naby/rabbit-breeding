import { describe, it, expect } from "vitest";
import {
  findWeakDoes,
  WEAK_DOE_MIN_LITTERS,
  WEAK_DOE_RELATIVE_PCT,
  type WeakDoeSource,
} from "@/lib/weak-does";
import { CULL_MIN_MATINGS } from "@/lib/cull-candidates";

/** A doe who passes every test, so each case can spoil exactly one thing. */
function doe(id: string, over: Partial<WeakDoeSource> = {}): WeakDoeSource {
  return {
    id,
    tagId: id,
    breed: "نيوزيلندي",
    matings: 10,
    kindlings: 8,
    bornAliveTotal: 64, // 8 per litter
    ...over,
  };
}

/** Enough healthy does that the herd average is set by them, not by the case. */
function herd(...extra: WeakDoeSource[]): WeakDoeSource[] {
  return [doe("g1"), doe("g2"), doe("g3"), doe("g4"), ...extra];
}

describe("findWeakDoes — fertility", () => {
  it("lists a doe under the absolute fertility bar", () => {
    const report = findWeakDoes(herd(doe("bad", { matings: 10, kindlings: 4 })));
    expect(report.weakDoes.map((d) => d.id)).toEqual(["bad"]);
    expect(report.weakDoes[0].reasons).toEqual(["fertility"]);
  });

  it("leaves a doe exactly on the bar alone", () => {
    // 50% is «أقل من 50%» failing to be met, same as the cull tile.
    expect(findWeakDoes(herd(doe("ok", { matings: 10, kindlings: 5 }))).weakDoes).toEqual([]);
  });

  it("does not judge a doe with too few matings", () => {
    const barely = doe("new", { matings: CULL_MIN_MATINGS - 1, kindlings: 0 });
    expect(findWeakDoes(herd(barely)).weakDoes).toEqual([]);
  });

  it("prints «—» rather than a number for the test it could not run", () => {
    // She fails on fertility, so she IS on the list — but with two kindlings
    // her litter-size cell must stay empty rather than convict her on one birth.
    const row = findWeakDoes(
      herd(doe("x", { matings: 10, kindlings: 2, bornAliveTotal: 6 }))
    ).weakDoes[0];
    expect(row.id).toBe("x");
    expect(row.avgLitterSize).toBeNull();
    expect(row.reasons).toEqual(["fertility"]);
  });
});

describe("findWeakDoes — litter size, against the farm's own average", () => {
  it("lists a doe a quarter below the barn", () => {
    // Four does at 8 plus her own 5 average 7.4, so the bar is 5.55 — and she
    // is under it. She counts in the average she is judged against: the bar is
    // "this barn", and she is part of this barn.
    const report = findWeakDoes(herd(doe("small", { bornAliveTotal: 40 })));
    expect(report.herdAvgLitterSize).toBeCloseTo(7.4, 5);
    expect(report.weakDoes.map((d) => d.id)).toEqual(["small"]);
    expect(report.weakDoes[0].reasons).toEqual(["litterSize"]);
  });

  it("leaves a doe merely below average alone", () => {
    // 7.5 against a barn of 8 — below average, nowhere near a culling case.
    expect(findWeakDoes(herd(doe("meh", { bornAliveTotal: 60 }))).weakDoes).toEqual([]);
  });

  it("moves with the breed rather than against a fixed number", () => {
    // A whole barn that kindles 5 has nobody weak in it: the bar is 3.75.
    const modest = [1, 2, 3, 4].map((i) => doe(`m${i}`, { bornAliveTotal: 40 }));
    expect(findWeakDoes(modest).weakDoes).toEqual([]);
  });

  it("does not judge a doe with too few kindlings", () => {
    const barely = doe("one", {
      matings: 2,
      kindlings: WEAK_DOE_MIN_LITTERS - 1,
      bornAliveTotal: 2,
    });
    expect(findWeakDoes(herd(barely)).weakDoes).toEqual([]);
  });

  it("counts her litters in the average even though it cannot judge her", () => {
    // The bar is kits ÷ litters over the whole barn, so her two litters count
    // like any other two — but only as two. Four does at 8 kindlings of 8 is
    // 256 kits in 32 litters; her 2 kits in 2 litters make it 258 ÷ 34.
    const barely = doe("one", { matings: 2, kindlings: 2, bornAliveTotal: 2 });
    expect(findWeakDoes(herd(barely)).herdAvgLitterSize).toBeCloseTo(258 / 34, 5);
    // And a short record still gets no verdict of its own.
    expect(findWeakDoes(herd(barely)).weakDoes.map((d) => d.id)).toEqual([]);
  });
});

describe("findWeakDoes — the list itself", () => {
  it("puts the doe who failed both tests first", () => {
    const oneReason = doe("one", { matings: 10, kindlings: 3 });
    const bothReasons = doe("both", {
      matings: 10,
      kindlings: 4,
      bornAliveTotal: 12, // 3 per litter, against a barn of ~8
    });
    const report = findWeakDoes(herd(oneReason, bothReasons));
    expect(report.weakDoes.map((d) => d.id)).toEqual(["both", "one"]);
    expect(report.weakDoes[0].reasons).toEqual(["fertility", "litterSize"]);
  });

  it("breaks a tie by how far below the bar she fell", () => {
    const worse = doe("worse", { matings: 10, kindlings: 1 });
    const bad = doe("bad", { matings: 10, kindlings: 4 });
    const ids = findWeakDoes(herd(bad, worse)).weakDoes.map((d) => d.id);
    expect(ids).toEqual(["worse", "bad"]);
  });

  it("counts the whole herd handed in, not just the weak", () => {
    const report = findWeakDoes(herd(doe("bad", { matings: 10, kindlings: 2 })));
    expect(report.doeCount).toBe(5);
    expect(report.weakDoes).toHaveLength(1);
  });

  it("returns an empty list and a null bar for an empty herd", () => {
    expect(findWeakDoes([])).toEqual({
      weakDoes: [],
      doeCount: 0,
      herdAvgLitterSize: null,
    });
  });

  it("keeps the relative bar at the figure the hint prints", () => {
    expect(WEAK_DOE_RELATIVE_PCT).toBe(75);
    expect(WEAK_DOE_MIN_LITTERS).toBe(3);
  });
});
