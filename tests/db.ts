import { prisma } from "@/lib/prisma";

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
];

/** Empties every table and re-seeds the single Settings row with defaults. */
export async function resetDb(): Promise<void> {
  assertTestDb();
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
  );
  await prisma.settings.create({ data: { id: 1 } });
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
