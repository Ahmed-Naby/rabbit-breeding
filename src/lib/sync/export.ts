import { prisma } from "@/lib/prisma";

/**
 * A complete, uncapped snapshot of every farm-data table — the safety net a
 * client is required to download before it's allowed to call runWipe().
 * Deliberately broader than runPull()'s incremental/board-scoped selection
 * (which caps PregnancyTestLog/KindlingLog at 100 rows and skips FeedLog
 * entirely, since the offline boards don't need them): this is a recovery
 * artifact, not a sync payload, so nothing here is filtered or capped.
 */
export async function runFullExport() {
  const [
    settings,
    rabbits,
    breedings,
    litters,
    weightRecords,
    healthRecords,
    feedLogs,
    transactions,
    kitStockMovements,
    breeds,
    pregnancyTestLogs,
    kindlingLogs,
    fosterLogs,
  ] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.rabbit.findMany({}),
    prisma.breeding.findMany({}),
    prisma.litter.findMany({}),
    prisma.weightRecord.findMany({}),
    prisma.healthRecord.findMany({}),
    prisma.feedLog.findMany({}),
    prisma.transaction.findMany({}),
    prisma.kitStockMovement.findMany({}),
    prisma.breed.findMany({}),
    prisma.pregnancyTestLog.findMany({}),
    prisma.kindlingLog.findMany({}),
    prisma.fosterLog.findMany({}),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    settings,
    rabbits,
    breedings,
    litters,
    weightRecords,
    healthRecords,
    feedLogs,
    transactions,
    kitStockMovements,
    breeds,
    pregnancyTestLogs,
    kindlingLogs,
    fosterLogs,
  };
}
