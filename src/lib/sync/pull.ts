import { prisma } from "@/lib/prisma";

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
  ] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.rabbit.findMany({ where: { updatedAt: { gt: since } } }),
    prisma.breeding.findMany({ where: { updatedAt: { gt: since } } }),
    prisma.litter.findMany({ where: { updatedAt: { gt: since } } }),
    prisma.weightRecord.findMany({ where: { updatedAt: { gt: since } } }),
    prisma.fosterLog.findMany({ where: { updatedAt: { gt: since } } }),
    prisma.kitStockMovement.findMany({ where: { updatedAt: { gt: since } } }),
    prisma.healthRecord.findMany({ where: { date: { gt: since } } }), // HealthRecords are date-based
    prisma.transaction.findMany({ where: { updatedAt: { gt: since } } }),
    prisma.breed.findMany({}),
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
  };
}
