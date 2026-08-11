import { describe, it, expect } from "vitest";
import {
  countCullBucks,
  countCullCandidates,
  CULL_FERTILITY_THRESHOLD_PCT,
  CULL_MIN_MATINGS,
} from "@/lib/cull-candidates";

describe("countCullCandidates", () => {
  it("counts a doe below the threshold", () => {
    expect(countCullCandidates([{ matings: 10, kindlings: 4 }])).toBe(1);
  });

  it("leaves a doe above it alone", () => {
    expect(countCullCandidates([{ matings: 10, kindlings: 6 }])).toBe(0);
  });

  it("treats exactly the threshold as passing", () => {
    // 50% is «أقل من 50%» failing to be met — the label says under, not up to.
    expect(countCullCandidates([{ matings: 10, kindlings: 5 }])).toBe(0);
  });

  it("ignores a doe with too few matings, however bad the ratio", () => {
    const barelyMated = { matings: CULL_MIN_MATINGS - 1, kindlings: 0 };
    expect(countCullCandidates([barelyMated])).toBe(0);
  });

  it("counts her once she has enough matings", () => {
    expect(countCullCandidates([{ matings: CULL_MIN_MATINGS, kindlings: 0 }])).toBe(1);
  });

  it("ignores a doe never mated at all — no ratio exists", () => {
    expect(countCullCandidates([{ matings: 0, kindlings: 0 }])).toBe(0);
  });

  it("sums across the herd", () => {
    expect(
      countCullCandidates([
        { matings: 32, kindlings: 2 }, // 6%
        { matings: 20, kindlings: 4 }, // 20%
        { matings: 20, kindlings: 15 }, // 75%
        { matings: 1, kindlings: 0 }, // unjudged
      ])
    ).toBe(2);
  });

  it("keeps the threshold at the figure the hint prints", () => {
    expect(CULL_FERTILITY_THRESHOLD_PCT).toBe(50);
    expect(CULL_MIN_MATINGS).toBe(3);
  });
});

describe("countCullBucks", () => {
  it("judges a buck on pregnancies, not on kindlings", () => {
    // Every doe he settled lost the litter afterwards: 100% for him, and none
    // of those losses are his to answer for.
    expect(countCullBucks([{ matings: 10, pregnancies: 10 }])).toBe(0);
    expect(countCullBucks([{ matings: 10, pregnancies: 4 }])).toBe(1);
  });

  it("treats exactly the threshold as passing", () => {
    expect(countCullBucks([{ matings: 10, pregnancies: 5 }])).toBe(0);
  });

  it("ignores a buck with too few matings, however bad the ratio", () => {
    expect(countCullBucks([{ matings: CULL_MIN_MATINGS - 1, pregnancies: 0 }])).toBe(0);
    expect(countCullBucks([{ matings: CULL_MIN_MATINGS, pregnancies: 0 }])).toBe(1);
  });

  it("ignores a buck never used at all — no ratio exists", () => {
    expect(countCullBucks([{ matings: 0, pregnancies: 0 }])).toBe(0);
  });

  it("sums across the barn", () => {
    expect(
      countCullBucks([
        { matings: 30, pregnancies: 3 },
        { matings: 20, pregnancies: 18 },
        { matings: 12, pregnancies: 5 },
        { matings: 2, pregnancies: 0 }, // unjudged
      ])
    ).toBe(2);
  });
});
