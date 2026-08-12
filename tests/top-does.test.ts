import { describe, it, expect } from "vitest";
import { findTopDoes } from "@/lib/top-does";
import { scoreDoe, herdLitterBaseline, type DoeTallies } from "@/lib/doe-score";
import { CULL_MIN_MATINGS } from "@/lib/cull-candidates";
import { WEAK_DOE_MIN_LITTERS } from "@/lib/weak-does";

/** An ordinary doe: every mating took, eight kits a litter. */
function doe(id: string, over: Partial<DoeTallies> = {}): DoeTallies {
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

describe("scoreDoe", () => {
  it("gives 100 to a doe who conceives every time and matches the barn's litter", () => {
    const herd = [doe("a"), doe("b"), doe("c")];
    // Every mating kindled, every litter the herd average → the ceiling.
    expect(scoreDoe(doe("a", { matings: 8 }), herdLitterBaseline(herd))).toBe(100);
  });

  it("halves the score when half the matings miss", () => {
    const herd = [doe("a"), doe("b")];
    const baseline = herdLitterBaseline(herd);
    // 4 litters out of 8 matings, 8 kits each: half the kits per mating.
    expect(scoreDoe({ matings: 8, kindlings: 4, bornAliveTotal: 32 }, baseline)).toBe(50);
  });

  it("halves it again when the litters are half the barn's size", () => {
    const herd = [doe("a"), doe("b")];
    const baseline = herdLitterBaseline(herd);
    expect(scoreDoe({ matings: 8, kindlings: 4, bornAliveTotal: 16 }, baseline)).toBe(25);
  });

  it("caps at 100 rather than rewarding a doe past the ceiling", () => {
    const herd = [doe("a"), doe("b")];
    const baseline = herdLitterBaseline(herd);
    expect(scoreDoe({ matings: 8, kindlings: 8, bornAliveTotal: 160 }, baseline)).toBe(100);
  });

  it("returns null — never 0 — below the minimum sample", () => {
    const baseline = herdLitterBaseline([doe("a"), doe("b")]);
    expect(scoreDoe({ matings: CULL_MIN_MATINGS - 1, kindlings: 8, bornAliveTotal: 64 }, baseline)).toBeNull();
    expect(
      scoreDoe({ matings: 10, kindlings: WEAK_DOE_MIN_LITTERS - 1, bornAliveTotal: 16 }, baseline)
    ).toBeNull();
  });

  it("returns null when the farm has no baseline to measure against", () => {
    expect(scoreDoe({ matings: 10, kindlings: 8, bornAliveTotal: 64 }, null)).toBeNull();
  });
});

describe("findTopDoes", () => {
  it("ranks the best doe first", () => {
    const report = findTopDoes([
      doe("mid", { matings: 10, kindlings: 6, bornAliveTotal: 42 }),
      doe("best", { matings: 8, kindlings: 8, bornAliveTotal: 72 }),
      doe("poor", { matings: 10, kindlings: 4, bornAliveTotal: 20 }),
    ]);
    expect(report.topDoes.map((d) => d.id)).toEqual(["best", "mid", "poor"]);
  });

  it("breaks a tie on the longer record", () => {
    // Identical kits per mating, different amounts of evidence behind it.
    const report = findTopDoes([
      doe("short", { matings: 5, kindlings: 4, bornAliveTotal: 32 }),
      doe("long", { matings: 10, kindlings: 8, bornAliveTotal: 64 }),
    ]);
    expect(report.topDoes[0].id).toBe("long");
  });

  it("leaves out a doe whose record is too short to score", () => {
    const report = findTopDoes([
      doe("proven"),
      doe("lucky", { matings: 2, kindlings: 2, bornAliveTotal: 24 }),
    ]);
    expect(report.topDoes.map((d) => d.id)).toEqual(["proven"]);
    expect(report.doeCount).toBe(2);
    expect(report.rankedCount).toBe(1);
  });

  it("keeps the list to the limit but counts the whole ranked field", () => {
    const does = Array.from({ length: 30 }, (_, i) =>
      doe(`d${i}`, { bornAliveTotal: 40 + i })
    );
    const report = findTopDoes(does, 5);
    expect(report.topDoes).toHaveLength(5);
    expect(report.rankedCount).toBe(30);
    // Best first, and no doe outside the slice beats the ones inside it.
    const scores = report.topDoes.map((d) => d.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores[0]).toBe(100);
  });

  it("averages the score over every ranked doe, not over the printed slice", () => {
    const report = findTopDoes(
      [
        doe("a", { matings: 8, kindlings: 8, bornAliveTotal: 64 }),
        doe("b", { matings: 16, kindlings: 8, bornAliveTotal: 64 }),
      ],
      1
    );
    expect(report.topDoes).toHaveLength(1);
    // 100 and 50, whatever the slice shows.
    expect(report.herdAvgScore).toBe(75);
  });

  it("returns an empty report for a farm with no breeding history", () => {
    expect(findTopDoes([])).toEqual({
      topDoes: [],
      doeCount: 0,
      rankedCount: 0,
      herdAvgLitterSize: null,
      herdAvgScore: null,
    });
  });
});
