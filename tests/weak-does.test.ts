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
    weaningCycles: 8,
    nursedTotal: 64,
    weanedTotal: 56, // 87.5% retention
    ...over,
  };
}

/** Enough healthy does that the herd averages are set by them, not by the case. */
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

  it("prints «—» rather than 0% for the test it could not run", () => {
    // She fails on litter size, so she IS on the list — but her rearing cell
    // must stay empty rather than read 0% for kits she has not weaned yet.
    const row = findWeakDoes(
      herd(
        doe("x", {
          bornAliveTotal: 24, // 3 per litter, against a barn of 8
          weaningCycles: 0,
          nursedTotal: 0,
          weanedTotal: 0,
        })
      )
    ).weakDoes[0];
    expect(row.id).toBe("x");
    expect(row.weaningRetentionPct).toBeNull();
    expect(row.reasons).toEqual(["litterSize"]);
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
      weaningCycles: 0,
      nursedTotal: 0,
      weanedTotal: 0,
    });
    expect(findWeakDoes(herd(barely)).weakDoes).toEqual([]);
  });

  it("keeps her out of the average she is being judged against", () => {
    // Her two-kindling record is unjudgeable, so it must not drag the bar down
    // for the does that do have a record.
    const barely = doe("one", { matings: 2, kindlings: 2, bornAliveTotal: 2 });
    expect(findWeakDoes(herd(barely)).herdAvgLitterSize).toBe(8);
  });
});

describe("findWeakDoes — rearing", () => {
  it("lists a doe who loses the kits she had", () => {
    // Barn retains ~87.5%, so the bar is ~65.6%. She retains 40%.
    const report = findWeakDoes(herd(doe("loses", { weanedTotal: 26 })));
    expect(report.weakDoes.map((d) => d.id)).toEqual(["loses"]);
    expect(report.weakDoes[0].reasons).toEqual(["rearing"]);
    expect(report.weakDoes[0].weaningRetentionPct).toBeCloseTo(40.625, 3);
  });

  it("does not judge a doe with no weaning on record", () => {
    const never = doe("never", { weaningCycles: 0, nursedTotal: 0, weanedTotal: 0 });
    const report = findWeakDoes(herd(never));
    expect(report.weakDoes).toEqual([]);
    expect(report.herdAvgRetentionPct).toBeCloseTo(87.5, 5);
  });
});

describe("findWeakDoes — the list itself", () => {
  it("puts the doe who failed the most tests first", () => {
    const oneReason = doe("one", { matings: 10, kindlings: 3 });
    const threeReasons = doe("three", {
      matings: 10,
      kindlings: 4,
      bornAliveTotal: 12, // 3 per litter, against a barn of ~8
      weanedTotal: 4,
      nursedTotal: 32,
    });
    const report = findWeakDoes(herd(oneReason, threeReasons));
    expect(report.weakDoes.map((d) => d.id)).toEqual(["three", "one"]);
    expect(report.weakDoes[0].reasons).toEqual(["fertility", "litterSize", "rearing"]);
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

  it("returns an empty list and null bars for an empty herd", () => {
    expect(findWeakDoes([])).toEqual({
      weakDoes: [],
      doeCount: 0,
      herdAvgLitterSize: null,
      herdAvgRetentionPct: null,
    });
  });

  it("keeps the relative bar at the figure the hint prints", () => {
    expect(WEAK_DOE_RELATIVE_PCT).toBe(75);
    expect(WEAK_DOE_MIN_LITTERS).toBe(3);
  });
});
