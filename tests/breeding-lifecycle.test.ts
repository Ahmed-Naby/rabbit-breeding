import { describe, test, expect, beforeEach } from "vitest";
import { resetDb, makeDoe, makeBuck, prisma } from "./db";
import {
  startBreedingOp,
  markMatedOp,
  setPregnancyTestResultOp,
  markKindledOp,
  markWeanedOp,
  recordKindlingOp,
  recordNursingKitDeathOp,
  setLitterCountOp,
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
    const kindled = await markKindledOp(breeding.id, doe.id, 7, 1);
    expect(kindled.ok).toBe(true);
    breeding = await prisma.breeding.findUniqueOrThrow({ where: { id: breeding.id } });
    // The row is a reusable current-cycle scratchpad: kindling clears the
    // mating date off it, preserving it in the permanent KindlingLog instead.
    expect(breeding.matingDate).toBeNull();
    expect(breeding.actualKindlingDate).not.toBeNull();
    const log = await prisma.kindlingLog.findFirstOrThrow({ where: { doeId: doe.id } });
    expect(log.matingDate?.toISOString()).toBe(matingDateBeforeKindling.toISOString());
    // Counts confirmed at the kindle press land on both the litter and the log.
    expect(log.bornAlive).toBe(7);
    expect(log.bornDead).toBe(1);
    expect((await prisma.rabbit.findUniqueOrThrow({ where: { id: doe.id } })).doeState).toBe("nursing");

    await markWeanedOp(breeding.id, doe.id);
    const litter = await prisma.litter.findUniqueOrThrow({ where: { breedingId: breeding.id } });
    expect(litter.bornAlive).toBe(7);
    expect(litter.bornDead).toBe(1);
    expect(litter.weaningDate).not.toBeNull();
    expect((await prisma.rabbit.findUniqueOrThrow({ where: { id: doe.id } })).doeState).toBe("empty");
  });

  test("kindling without a mating date is rejected, changing nothing", async () => {
    const doe = await makeDoe();
    await prisma.breeding.create({
      data: { doeId: doe.id, expectedKindlingDate: new Date() },
    });
    const breeding = await prisma.breeding.findFirstOrThrow({ where: { doeId: doe.id } });

    const result = await markKindledOp(breeding.id, doe.id, 0, 0);
    expect(result).toEqual({ ok: false, code: "NO_MATING_DATE" });
    expect(await prisma.kindlingLog.count()).toBe(0);
  });

  test("re-mating an empty doe reuses her breeding row and clears the stale cycle", async () => {
    const doe = await makeDoe();
    await startBreedingOp(doe.id);
    const breeding = await prisma.breeding.findFirstOrThrow({ where: { doeId: doe.id } });
    await markKindledOp(breeding.id, doe.id, 6, 0);
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
    await markKindledOp(first.id, doe.id, 5, 0);

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
      weaningWeightGrams: null,
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
      weaningWeightGrams: null,
      weaningDate: null,
      notes: null,
    });
    expect(second.ok).toBe(false);
  });

  // The counts a nursing death moves (litter.bornAlive down, bornDead up) are
  // recycled by the doe's next cycle, so before KitDeathLog the event left no
  // trace with a date on it and could never reach سجل النفوق or the اليومية.
  test("a nursing kit death is archived as its own dated event", async () => {
    const doe = await makeDoe();
    await startBreedingOp(doe.id);
    let breeding = await prisma.breeding.findFirstOrThrow({ where: { doeId: doe.id } });
    await markKindledOp(breeding.id, doe.id, 7, 1);
    breeding = await prisma.breeding.findUniqueOrThrow({ where: { id: breeding.id } });

    const death = await recordNursingKitDeathOp(breeding.id, 2);
    expect(death.ok).toBe(true);

    const deaths = await prisma.kitDeathLog.findMany({ where: { doeId: doe.id } });
    expect(deaths).toHaveLength(1);
    expect(deaths[0].count).toBe(2);
    expect(deaths[0].breedingId).toBe(breeding.id);
    // Snapshotted so the row still says which litter died once the next mating
    // wipes Breeding.actualKindlingDate.
    expect(deaths[0].kindlingDate?.toISOString()).toBe(breeding.actualKindlingDate!.toISOString());
    // Stamped at UTC midnight like every other log date, so the [day, day+1)
    // range the اليومية queries with catches it.
    expect(deaths[0].deathDate.toISOString()).toMatch(/T00:00:00\.000Z$/);

    // A second press is its own row, not an edit of the first — two deaths a
    // week apart have to stay distinguishable.
    await recordNursingKitDeathOp(breeding.id, 1);
    expect(await prisma.kitDeathLog.count({ where: { doeId: doe.id } })).toBe(2);
    const litter = await prisma.litter.findUniqueOrThrow({ where: { breedingId: breeding.id } });
    expect(litter.bornAlive).toBe(4);
    expect(litter.bornDead).toBe(4);
  });
});

describe("setLitterCountOp — telling the two refusals apart", () => {
  test("names the missing litter instead of blaming the number", async () => {
    // A breeding that never kindled has no Litter row, so the op's
    // `litter?.bornAlive ?? 0` is the absence of a count, not a count of zero.
    // Every weaned number fails against it — the farmer must not be told his 3
    // exceeds a «مواليد أحياء» he was never asked for.
    const doe = await makeDoe();
    await startBreedingOp(doe.id);
    const breeding = await prisma.breeding.findFirstOrThrow({ where: { doeId: doe.id } });

    const result = await setLitterCountOp(breeding.id, "weaned", 3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NO_LITTER");
    // And nothing was written: a rejected count must not conjure a litter.
    expect(await prisma.litter.findUnique({ where: { breedingId: breeding.id } })).toBeNull();
  });

  test("still blames the number when a litter really is there", async () => {
    const doe = await makeDoe();
    await startBreedingOp(doe.id);
    const breeding = await prisma.breeding.findFirstOrThrow({ where: { doeId: doe.id } });
    await markKindledOp(breeding.id, doe.id, 6, 0);

    const result = await setLitterCountOp(breeding.id, "weaned", 9);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("WEANED_EXCEEDS_BORN_ALIVE");

    // A weaning that fits is still accepted, so the guard hasn't grown teeth.
    expect((await setLitterCountOp(breeding.id, "weaned", 6)).ok).toBe(true);
    const litter = await prisma.litter.findUniqueOrThrow({ where: { breedingId: breeding.id } });
    expect(litter.weaned).toBe(6);
  });

  test("a first bornAlive on a breeding with no litter still creates one", async () => {
    // The NO_LITTER branch must not swallow the ordinary case: entering «حي»
    // from the board is exactly how a litter row comes into being there.
    const doe = await makeDoe();
    await startBreedingOp(doe.id);
    const breeding = await prisma.breeding.findFirstOrThrow({ where: { doeId: doe.id } });

    expect((await setLitterCountOp(breeding.id, "bornAlive", 8)).ok).toBe(true);
    const litter = await prisma.litter.findUniqueOrThrow({ where: { breedingId: breeding.id } });
    expect(litter.bornAlive).toBe(8);
  });
});
