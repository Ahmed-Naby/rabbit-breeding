import { prisma } from "@/lib/prisma";
import { currentFarmId } from "@/lib/tenant";

/**
 * Incremental read side of sync, shared by /api/sync/pull (since a cursor)
 * and /api/sync/bootstrap (since epoch, a device's first-ever sync). Scoped
 * to the models the offline boards actually need: Rabbit/Breeding/Litter for
 * the board data itself, WeightRecord for weaning/stock weights, and the
 * single Settings row (needed on-device to recompute expectedKindling etc.
 * locally, per the mobile app's optimistic-apply design) — always returned
 * in full since it's one row, not filtered by `since`.
 */
export async function runPull(since: Date) {
  const [
    settings,
    rabbits,
    breedings,
    litters,
    weightRecords,
    fosterLogs,
    kitStockMovements,
    healthRecords,
    transactions,
    breeds,
    pregnancyTestLogs,
    kindlingLogs,
  ] = await Promise.all([
    prisma.settings.findUnique({ where: { farmId: currentFarmId() } }),
    prisma.rabbit.findMany({ where: { updatedAt: { gt: since } } }),
    prisma.breeding.findMany({ where: { updatedAt: { gt: since } } }),
    prisma.litter.findMany({ where: { updatedAt: { gt: since } } }),
    prisma.weightRecord.findMany({ where: { updatedAt: { gt: since } } }),
    prisma.fosterLog.findMany({ where: { createdAt: { gt: since } } }),
    prisma.kitStockMovement.findMany({ where: { createdAt: { gt: since } } }),
    prisma.healthRecord.findMany({ where: { createdAt: { gt: since } } }),
    prisma.transaction.findMany({ where: { createdAt: { gt: since } } }),
    prisma.breed.findMany({}),
    prisma.pregnancyTestLog.findMany({ orderBy: { testDate: "desc" }, take: 100 }),
    prisma.kindlingLog.findMany({ orderBy: { kindlingDate: "desc" }, take: 100 }),
  ]);

  return {
    settings,
    rabbits,
    breedings,
    litters,
    weightRecords,
    fosterLogs,
    kitStockMovements,
    healthRecords,
    transactions,
    breeds,
    pregnancyTestLogs,
    kindlingLogs,
  };
}
