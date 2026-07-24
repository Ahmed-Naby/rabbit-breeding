import { prisma } from "@/lib/prisma";
import { currentFarmId } from "@/lib/tenant";
import { deleteAllFarmOperations } from "./delete-all";

/**
 * Permanently deletes every recorded operation of the active farm from the
 * central database — matings, pregnancy tests, resorptions, kindlings,
 * weanings, fostering, weight/health records, finance and stock movements,
 * plus the live Breeding/Litter cycle rows — while KEEPING the herd (rabbits,
 * bucks) and the breed registry. Backs the "reset operations only"
 * danger-zone action.
 *
 * Unlike runWipe(), the farm's Settings VALUES are preserved (gestation
 * config, weight unit, currency, …) — only dataResetAt is stamped, so every
 * syncing device (including the one that triggered this) discovers the reset
 * and re-bootstraps its local mirror, which will now hold the surviving
 * rabbits/breeds but none of the deleted operation history (see pull()'s
 * dataResetAt check in src/mobile/sync/sync-manager.ts).
 */
export async function runResetOperations(): Promise<{ dataResetAt: string }> {
  const dataResetAt = new Date();
  const farmId = currentFarmId();

  await prisma.$transaction(async (tx) => {
    await deleteAllFarmOperations(tx);
    await tx.settings.upsert({
      where: { farmId },
      create: { farmId, dataResetAt },
      update: { dataResetAt },
    });
  });

  return { dataResetAt: dataResetAt.toISOString() };
}
