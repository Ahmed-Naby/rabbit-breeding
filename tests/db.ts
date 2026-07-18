import { prisma } from "@/lib/prisma";

/** The ambient farm every test runs in (see setup.ts DEFAULT_FARM_ID). */
export const TEST_FARM_ID = "test_farm_00000000000001";

// Refuse to run destructive helpers against anything but the test database —
// the guard that keeps a mis-wired env from truncating real farm data.
function assertTestDb(): void {
  if (!process.env.DATABASE_URL?.includes("/rabbittrack_test")) {
    throw new Error(`Refusing to reset non-test database: ${process.env.DATABASE_URL}`);
  }
}

const TABLES = [
  "KitStockMovement", "Transaction", "HealthRecord", "WeightRecord",
  "FosterLog", "KindlingLog", "PregnancyTestLog", "Litter", "Breeding",
  "Rabbit", "Breed", "SyncOperation", "SyncDevice", "Settings",
  "DeviceToken", "FarmMember", "Farm", "User",
];

/** Empties every table and re-seeds the test farm + its Settings row. */
export async function resetDb(): Promise<void> {
  assertTestDb();
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
  );
  await prisma.farm.create({ data: { id: TEST_FARM_ID, name: "Test Farm" } });
  await prisma.settings.create({ data: { farmId: TEST_FARM_ID } });
}

/** A second farm for cross-tenant isolation tests. */
export async function makeOtherFarm(id = "other_farm_000000000001"): Promise<string> {
  await prisma.farm.create({ data: { id, name: "Other Farm" } });
  await prisma.settings.create({ data: { farmId: id } });
  return id;
}

let doeCounter = 0;

export async function makeDoe(overrides: Record<string, unknown> = {}) {
  doeCounter += 1;
  return prisma.rabbit.create({
    data: { tagId: `D${doeCounter}`, sex: "doe", status: "active", doeState: "empty", ...overrides },
  });
}

export async function makeBuck(overrides: Record<string, unknown> = {}) {
  doeCounter += 1;
  return prisma.rabbit.create({
    data: { tagId: `B${doeCounter}`, sex: "buck", status: "active", ...overrides },
  });
}

export { prisma };
