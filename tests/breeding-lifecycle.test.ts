import { describe, test, expect, beforeEach } from "vitest";
import { resetDb, makeDoe, makeBuck, prisma } from "./db";
import {
  startBreedingOp,
  markMatedOp,
  setPregnancyTestResultOp,
  markKindledOp,
  markWeanedOp,
  recordKindlingOp,
} from "@/lib/breeding-ops";

beforeEach(resetDb);

describe("breeding lifecycle", () => {
  test("start → positive test → kindle → wean walks the doe through her states", async () => {
    const doe = await makeDoe();
    const buck = await makeBuck();

    await startBreedingOp(doe.id, buck.tagId!);
    let breeding = await prisma.breeding.findFirstOrThrow({ where: { doeId: doe.id } });
    expect(breeding.matingDate).not.toBeNull();
    expect(breeding.buckId).toBe(buck.id);
    expect((await prisma.rabbit.findUniqueOrThrow({ where: { id: doe.id } })).doeState).toBe("bred");

    await setPregnancyTestResultOp(breeding.id, "positive");
    breeding = await prisma.breeding.findUniqueOrThrow({ where: { id: breeding.id } });
    expect(breeding.pregnancyTestResult).toBe("positive");

    const matingDateBeforeKindling = breeding.matingDate!;
    const kindled = await markKindledOp(breeding.id, doe.id);
    expect(kindled.ok).toBe(true);
    breeding = await prisma.breeding.findUniqueOrThrow({ where: { id: breeding.id } });
    // The row is a reusable current-cycle scratchpad: kindling clears the
    // mating date off it, preserving it in the permanent KindlingLog instead.
    expect(breeding.matingDate).toBeNull();
    expect(breeding.actualKindlingDate).not.toBeNull();
    const log = await prisma.kindlingLog.findFirstOrThrow({ where: { doeId: doe.id } });
    expect(log.matingDate?.toISOString()).toBe(matingDateBeforeKindling.toISOString());
    expect((await prisma.rabbit.findUniqueOrThrow({ where: { id: doe.id } })).doeState).toBe("nursing");

    await markWeanedOp(breeding.id, doe.id);
    const litter = await prisma.litter.findUniqueOrThrow({ where: { breedingId: breeding.id } });
    expect(litter.weaningDate).not.toBeNull();
    expect((await prisma.rabbit.findUniqueOrThrow({ where: { id: doe.id } })).doeState).toBe("empty");
  });

  test("kindling without a mating date is rejected, changing nothing", async () => {
    const doe = await makeDoe();
    await prisma.breeding.create({
      data: { doeId: doe.id, expectedKindlingDate: new Date() },
    });
    const breeding = await prisma.breeding.findFirstOrThrow({ where: { doeId: doe.id } });

    const result = await markKindledOp(breeding.id, doe.id);
    expect(result).toEqual({ ok: false, code: "NO_MATING_DATE" });
    expect(await prisma.kindlingLog.count()).toBe(0);
  });

  test("re-mating an empty doe reuses her breeding row and clears the stale cycle", async () => {
    const doe = await makeDoe();
    await startBreedingOp(doe.id);
    const breeding = await prisma.breeding.findFirstOrThrow({ where: { doeId: doe.id } });
    await markKindledOp(breeding.id, doe.id);
    await prisma.rabbit.update({ where: { id: doe.id }, data: { doeState: "empty" } });

    await markMatedOp(breeding.id, doe.id);
    expect(await prisma.breeding.count({ where: { doeId: doe.id } })).toBe(1);
    const reused = await prisma.breeding.findUniqueOrThrow({ where: { id: breeding.id } });
    expect(reused.matingDate).not.toBeNull();
    expect(reused.actualKindlingDate).toBeNull();
  });

  test("re-mating a nursing doe forks a new breeding row instead of overwriting the litter's", async () => {
    const doe = await makeDoe();
    await startBreedingOp(doe.id);
    const first = await prisma.breeding.findFirstOrThrow({ where: { doeId: doe.id } });
    await markKindledOp(first.id, doe.id);

    await markMatedOp(first.id, doe.id);
    expect(await prisma.breeding.count({ where: { doeId: doe.id } })).toBe(2);
    expect((await prisma.rabbit.findUniqueOrThrow({ where: { id: doe.id } })).doeState).toBe("nursing_bred");
    // The nursing cycle's row keeps its kindling date untouched.
    const untouched = await prisma.breeding.findUniqueOrThrow({ where: { id: first.id } });
    expect(untouched.actualKindlingDate).not.toBeNull();
  });

  test("recordKindling creates the litter once and rejects a second attempt", async () => {
    const doe = await makeDoe();
    await startBreedingOp(doe.id);
    const breeding = await prisma.breeding.findFirstOrThrow({ where: { doeId: doe.id } });

    const first = await recordKindlingOp(breeding.id, {
      kindlingDate: new Date(),
      bornAlive: 8,
      bornDead: 1,
      weaned: null,
      weaningDate: null,
      notes: null,
    });
    expect(first.ok).toBe(true);
    const litter = await prisma.litter.findUniqueOrThrow({ where: { breedingId: breeding.id } });
    expect(litter.bornAlive).toBe(8);
    expect(litter.bornDead).toBe(1);

    const second = await recordKindlingOp(breeding.id, {
      kindlingDate: new Date(),
      bornAlive: 5,
      bornDead: 0,
      weaned: null,
      weaningDate: null,
      notes: null,
    });
    expect(second.ok).toBe(false);
  });
});
