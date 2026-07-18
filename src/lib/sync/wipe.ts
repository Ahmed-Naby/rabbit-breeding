import { prisma } from "@/lib/prisma";
import { deleteAllFarmData } from "./delete-all";

/**
 * Permanently deletes every farm-data row from the central database — the
 * "wipe online database" danger-zone action. Settings is reset to its
 * column defaults rather than deleted — the app assumes a single Settings
 * row (id=1) always exists — and stamped with dataResetAt so every syncing
 * device (including the one that triggered this) discovers the wipe and
 * re-bootstraps instead of silently keeping its now-stale local mirror
 * forever (see pull()'s dataResetAt check in
 * src/mobile/sync/sync-manager.ts).
 */
export async function runWipe(): Promise<{ dataResetAt: string }> {
  const dataResetAt = new Date();

  await prisma.$transaction(async (tx) => {
    await deleteAllFarmData(tx);
    await tx.settings.upsert({
      where: { id: 1 },
      create: { id: 1, dataResetAt },
      update: {
        weightUnit: "kg",
        gestationDays: 31,
        gestationWindowDays: 3,
        pregnancyTestDays: 10,
        weaningDays: 28,
        nestBoxDays: 27,
        matingWeightGrams: 3000,
        rebreedAfterKindlingDays: 0,
        currency: "USD",
        dataResetAt,
      },
    });
  });

  return { dataResetAt: dataResetAt.toISOString() };
}
