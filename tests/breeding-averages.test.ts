import { describe, test, expect } from "vitest";
import {
  computeBreedingAverages,
  type AverageKindlingRow,
  type AverageWeaningRow,
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

describe("computeBreedingAverages", () => {
  test("divides litter size by kindlings, and weaning figures by weanings", () => {
    const r = computeBreedingAverages(
      [litter(8, 1, 1), litter(6, 0, 0)],
      [weaning(7), weaning(5)],
      4, // نافق الفطام
      30 // رصيد الفطام — a total, passed straight through
    );

    expect(r.kindlings).toBe(2);
    expect(r.weanings).toBe(2);
    expect(r.bornAlive).toBe(7); // (8 + 6) / 2
    expect(r.weaned).toBe(6); // (7 + 5) / 2
    expect(r.weanedStockDeaths).toBe(2); // 4 / 2
    // Never divided: a stock level has no denominator.
    expect(r.remainingStock).toBe(30);
  });

  test("the stock balance ignores the period entirely", () => {
    // Same farm, two different report windows. The balance card must not move.
    const wide = computeBreedingAverages(
      [litter(8, 0, 0), litter(6, 0, 0)],
      [weaning(7), weaning(5)],
      4,
      977
    );
    const oneWeek = computeBreedingAverages([], [], 0, 977);

    expect(wide.remainingStock).toBe(977);
    expect(oneWeek.remainingStock).toBe(977);
    // The period-bound averages DO collapse — only this one is immune.
    expect(oneWeek.weaned).toBeNull();
  });

  test("counts events, not does — a doe that kindled twice counts twice", () => {
    // The whole point of the event denominator: bornAlive stays a real litter
    // size (comparable to the breed standard) instead of doubling into
    // "kits produced per doe over the period".
    const r = computeBreedingAverages(
      [litter(8, 0, 0), litter(6, 0, 0)],
      [weaning(7), weaning(5)],
      6,
      12
    );

    expect(r.kindlings).toBe(2);
    expect(r.weanings).toBe(2);
    expect(r.bornAlive).toBe(7); // not 14
    expect(r.weaned).toBe(6);
    expect(r.weanedStockDeaths).toBe(3);
  });

  test("averages nursing deaths from the gap between bornDead and bornDeadAtKindling", () => {
    // First litter lost 3 while nursing (5 - 2), the second lost 1 (1 - 0).
    const r = computeBreedingAverages([litter(9, 5, 2), litter(7, 1, 0)], [], 0, 0);

    expect(r.nursingDeaths).toBe(2); // (3 + 1) / 2
    expect(r.nursingDeathsLitters).toBe(2);
    expect(r.unknownNursingLitters).toBe(0);
  });

  test("excludes legacy litters from BOTH sides of the nursing average rather than scoring them zero", () => {
    // Counting the legacy row as "lost nothing" would report 4/2 = 2.0 and
    // flatter the herd; excluding it reports the 4 losses we can actually see.
    const r = computeBreedingAverages([litter(9, 6, 2), legacyLitter(7, 3)], [], 0, 0);

    expect(r.nursingDeaths).toBe(4); // 4 / 1, not 4 / 2
    expect(r.nursingDeathsLitters).toBe(1);
    expect(r.unknownNursingLitters).toBe(1);
    // The excluded litter still counts toward litter size, which IS knowable.
    expect(r.kindlings).toBe(2);
    expect(r.bornAlive).toBe(8); // (9 + 7) / 2
  });

  test("returns null, not 0, for nursing deaths when every litter is legacy", () => {
    const r = computeBreedingAverages([legacyLitter(8, 2), legacyLitter(6, 1)], [], 0, 0);

    expect(r.nursingDeaths).toBeNull();
    expect(r.unknownNursingLitters).toBe(2);
    expect(r.bornAlive).toBe(7);
  });

  test("returns null for every average whose denominator is zero", () => {
    // A farm with stock on the books but not a single counted weaning yet.
    const r = computeBreedingAverages([], [], 9, 40);

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
    const r = computeBreedingAverages(
      [litter(8, 0, 0), litter(10, 0, 0)],
      [weaning(7)],
      2,
      20
    );

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
    const r = computeBreedingAverages([litter(8, 1, 4)], [], 0, 0);

    expect(r.nursingDeaths).toBe(0);
  });
});
