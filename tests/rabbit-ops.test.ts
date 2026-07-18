import { describe, test, expect, beforeEach } from "vitest";
import { resetDb, makeDoe, makeBuck, prisma } from "./db";
import {
  createQuickRabbitOp,
  finalizeMotherOp,
  setRabbitStatusOp,
  deleteRabbitOp,
} from "@/lib/rabbit-ops";
import { startBreedingOp } from "@/lib/breeding-ops";

beforeEach(resetDb);

describe("quick intake", () => {
  test("creates the rabbit, its retained stock movement, and its weight record", async () => {
    const result = await createQuickRabbitOp({
      tagId: "7",
      breed: "نيوزلندي",
      sex: "doe",
      date: new Date(),
      weightKg: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.origin).toBe("farm");
    expect(await prisma.kitStockMovement.count({ where: { rabbitId: result.data.id, type: "retained" } })).toBe(1);
    const weight = await prisma.weightRecord.findFirstOrThrow({ where: { rabbitId: result.data.id } });
    expect(weight.weightGrams).toBe(3000);
  });

  test("tag numbers are unique per sex — same number, other sex is allowed", async () => {
    await createQuickRabbitOp({ tagId: "7", breed: null, sex: "doe", date: new Date(), weightKg: null });

    const clash = await createQuickRabbitOp({ tagId: "7", breed: null, sex: "doe", date: new Date(), weightKg: null });
    expect(clash).toEqual({ ok: false, code: "TAG_IN_USE" });

    const otherSex = await createQuickRabbitOp({ tagId: "7", breed: null, sex: "buck", date: new Date(), weightKg: null });
    expect(otherSex.ok).toBe(true);
  });
});

describe("finalizeMother", () => {
  test("assigns the tag and upserts the latest weight in place", async () => {
    const juvenile = await prisma.rabbit.create({ data: { sex: "doe", status: "active" } });
    await prisma.weightRecord.create({
      data: { rabbitId: juvenile.id, date: new Date(), weightGrams: 900 },
    });

    const result = await finalizeMotherOp(juvenile.id, "42", 2.5);
    expect(result.ok).toBe(true);
    expect((await prisma.rabbit.findUniqueOrThrow({ where: { id: juvenile.id } })).tagId).toBe("42");
    // The existing record is updated, not duplicated.
    const weights = await prisma.weightRecord.findMany({ where: { rabbitId: juvenile.id } });
    expect(weights).toHaveLength(1);
    expect(weights[0].weightGrams).toBe(2500);
  });

  test("rejects a tag already held by another doe", async () => {
    await makeDoe({ tagId: "42" });
    const juvenile = await prisma.rabbit.create({ data: { sex: "doe", status: "active" } });
    expect(await finalizeMotherOp(juvenile.id, "42", 2)).toEqual({ ok: false, code: "TAG_IN_USE" });
  });
});

describe("status changes and deletion", () => {
  test("marking a tagged rabbit deceased retires her number for immediate reuse", async () => {
    const doe = await makeDoe({ tagId: "9" });
    await setRabbitStatusOp(doe.id, "deceased");
    const updated = await prisma.rabbit.findUniqueOrThrow({ where: { id: doe.id } });
    expect(updated.tagId).toBeNull();
    expect(updated.retiredTagId).toContain("9");

    // The freed number is immediately assignable to a new doe.
    const next = await createQuickRabbitOp({ tagId: "9", breed: null, sex: "doe", date: new Date(), weightKg: null });
    expect(next.ok).toBe(true);
  });

  test("a rabbit with breeding history cannot be deleted", async () => {
    const doe = await makeDoe();
    await startBreedingOp(doe.id);
    expect(await deleteRabbitOp(doe.id)).toEqual({ ok: false, code: "DELETE_BLOCKED_BY_BREEDING" });
    expect(await prisma.rabbit.count()).toBe(1);
  });
});
