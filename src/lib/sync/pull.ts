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
  // CAREFUL: this is a positional tuple — the names below must line up 1:1 with
  // the Promise.all entries, in order. Adding a query without adding its name
  // silently shifts every later binding onto the wrong model, and nothing
  // catches it: destructuring fewer elements than the tuple has is legal TS, and
  // the vars are unannotated so each just infers the wrong Prisma type. That
  // shipped once — resorptionLog went in above pregnancyTestLog with no name,
  // so devices wrote PregnancyTestLog rows into kindling_log (NOT NULL
  // constraint failed: kindling_log.kindlingDate) and read WeaningLog rows as
  // tombstones, which silently stopped every hard delete from propagating.
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
    matingLogs,
    nestBoxLogs,
    resorptionLogs,
    pregnancyTestLogs,
    kindlingLogs,
    weaningLogs,
    tombstones,
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
    prisma.matingLog.findMany({ orderBy: { matingDate: "desc" }, take: 100 }),
    prisma.nestBoxLog.findMany({ orderBy: { nestBoxDate: "desc" }, take: 100 }),
    // Never sent before, so a device that lost its resorption_log (a restore
    // stamps a fresh dataResetAt, and the re-bootstrap empties every table)
    // had no way to get the rows back.
    prisma.resorptionLog.findMany({ orderBy: { resorptionDate: "desc" }, take: 100 }),
    prisma.pregnancyTestLog.findMany({ orderBy: { testDate: "desc" }, take: 100 }),
    prisma.kindlingLog.findMany({ orderBy: { kindlingDate: "desc" }, take: 100 }),
    prisma.weaningLog.findMany({ orderBy: { weaningDate: "desc" }, take: 100 }),
    // Hard deletes never show up in the `updatedAt > since` diffs above (a
    // gone row can't be "found"), so every incrementally-pulled model that's
    // ever hard-deleted (see SyncTombstone) needs its removal reported here
    // explicitly, or every other already-bootstrapped device keeps a
    // permanent phantom copy of it forever.
    prisma.syncTombstone.findMany({ where: { deletedAt: { gt: since } } }),
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
    matingLogs,
    nestBoxLogs,
    resorptionLogs,
    pregnancyTestLogs,
    kindlingLogs,
    weaningLogs,
    tombstones,
  };
}
