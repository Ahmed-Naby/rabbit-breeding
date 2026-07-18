import { describe, test, expect, beforeEach } from "vitest";
import { resetDb, makeOtherFarm, makeDoe, prisma, TEST_FARM_ID } from "./db";
import { runWithFarm } from "@/lib/tenant";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { issueToken, resolveToken, revokeToken } from "@/lib/auth/tokens";
import { createQuickRabbitOp } from "@/lib/rabbit-ops";
import { startBreedingOp } from "@/lib/breeding-ops";
import { runWipe } from "@/lib/sync/wipe";
import { runPull } from "@/lib/sync/pull";

beforeEach(resetDb);

describe("cross-farm isolation", () => {
  test("reads and writes are invisible across farms", async () => {
    const other = await makeOtherFarm();

    await makeDoe({ tagId: "1" }); // test farm (ambient context)
    await runWithFarm(other, async () => {
      const created = await createQuickRabbitOp({
        tagId: "1", breed: null, sex: "doe", date: new Date(), weightKg: null,
      });
      expect(created.ok).toBe(true); // same tag as the other farm's doe — no clash across farms
    });

    expect(await prisma.rabbit.count()).toBe(1); // ambient = test farm
    await runWithFarm(other, async () => {
      expect(await prisma.rabbit.count()).toBe(1); // other farm sees only its own
    });
    expect(await prisma.rabbit.count({ where: {} })).toBe(1);
  });

  test("a farm's wipe does not touch the other farm", async () => {
    const other = await makeOtherFarm();
    await makeDoe();
    await runWithFarm(other, () => makeDoe({ tagId: "X1" }));

    await runWithFarm(other, () => runWipe());

    expect(await prisma.rabbit.count()).toBe(1); // test farm untouched
    await runWithFarm(other, async () => {
      expect(await prisma.rabbit.count()).toBe(0);
    });
    // Only the other farm's reset marker moved.
    const testSettings = await prisma.settings.findUniqueOrThrow({ where: { farmId: TEST_FARM_ID } });
    expect(testSettings.dataResetAt).toBeNull();
  });

  test("pull returns only the active farm's rows", async () => {
    const other = await makeOtherFarm();
    const myDoe = await makeDoe();
    await runWithFarm(other, () => makeDoe({ tagId: "X1" }));

    const mine = await runPull(new Date(0));
    expect(mine.rabbits).toHaveLength(1);
    expect((mine.rabbits[0] as { tagId: string }).tagId).toBe(myDoe.tagId);

    const theirs = await runWithFarm(other, () => runPull(new Date(0)));
    expect(theirs.rabbits).toHaveLength(1);
    expect((theirs.rabbits[0] as { tagId: string }).tagId).toBe("X1");
  });

  test("ops running inside a farm context stamp their rows with that farm", async () => {
    const other = await makeOtherFarm();
    const doe = await runWithFarm(other, () => makeDoe());
    await runWithFarm(other, () => startBreedingOp(doe.id));

    const breeding = await prisma.breeding.findFirst({ where: {} });
    expect(breeding).toBeNull(); // invisible from the test farm
    const otherBreeding = await runWithFarm(other, () => prisma.breeding.findFirstOrThrow({ where: {} }));
    expect(otherBreeding.farmId).toBe(other);
  });
});

describe("auth primitives", () => {
  test("password hashing round-trips and rejects wrong passwords", () => {
    const stored = hashPassword("سر-المزرعة-123");
    expect(verifyPassword("سر-المزرعة-123", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  test("device tokens resolve to their user + memberships and can be revoked", async () => {
    const user = await prisma.user.create({
      data: { email: "owner@test.dev", passwordHash: hashPassword("password123") },
    });
    await prisma.farmMember.create({
      data: { farmId: TEST_FARM_ID, userId: user.id, role: "owner" },
    });

    const token = await issueToken(user.id, "test device");
    const resolved = await resolveToken(token);
    expect(resolved?.userId).toBe(user.id);
    expect(resolved?.memberships).toEqual([
      { farmId: TEST_FARM_ID, role: "owner", farmName: "Test Farm", farmLocation: null, allowedPages: null },
    ]);

    expect(await resolveToken("not-a-real-token")).toBeNull();

    await revokeToken(token);
    expect(await resolveToken(token)).toBeNull();
  });
});
