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
const DAY_MS = 86_400_000;

/**
 * How far back a permanent *Log row is still assumed to be editable.
 *
 * These archives have no `updatedAt`, so they cannot be diffed the way every
 * model below is — and some of them genuinely keep changing after insert
 * (KindlingLog.bornAlive/bornDead move with every fostering and kit death).
 * A plain `createdAt > since` would therefore never resend an edited row.
 *
 * The previous answer was "always resend the newest 100", which did propagate
 * those edits but also capped a device's copy of history at 100 rows per model
 * FOREVER: a farm with 1,065 kindlings on the server showed 100 on the phone,
 * so every archive-backed report (إنتاجية القطيع, متوسطات الأداء, سجل التلقيح)
 * silently reported on a fraction of the farm while looking perfectly normal.
 *
 * So each archive is now pulled as "created since the cursor OR recent enough
 * to still be edited". 120 days comfortably outlives the longest configured
 * cycle (طبيعي, ~61 days), and a row stops mutating once the doe starts her
 * next cycle. On bootstrap (since = epoch) the first arm matches every row ever
 * written, which is what makes a first sync complete with no special case.
 */
const MUTABLE_ARCHIVE_DAYS = 120;

export async function runPull(since: Date) {
  const mutableSince = new Date(Date.now() - MUTABLE_ARCHIVE_DAYS * DAY_MS);

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
    kitDeathLogs,
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
    // See MUTABLE_ARCHIVE_DAYS: created-since-cursor OR still-editable window.
    prisma.matingLog.findMany({
      where: { OR: [{ createdAt: { gt: since } }, { matingDate: { gte: mutableSince } }] },
    }),
    prisma.nestBoxLog.findMany({
      where: { OR: [{ createdAt: { gt: since } }, { nestBoxDate: { gte: mutableSince } }] },
    }),
    // Never sent before, so a device that lost its resorption_log (a restore
    // stamps a fresh dataResetAt, and the re-bootstrap empties every table)
    // had no way to get the rows back.
    prisma.resorptionLog.findMany({
      where: { OR: [{ createdAt: { gt: since } }, { resorptionDate: { gte: mutableSince } }] },
    }),
    prisma.pregnancyTestLog.findMany({
      where: { OR: [{ createdAt: { gt: since } }, { testDate: { gte: mutableSince } }] },
    }),
    prisma.kindlingLog.findMany({
      where: { OR: [{ createdAt: { gt: since } }, { kindlingDate: { gte: mutableSince } }] },
    }),
    prisma.weaningLog.findMany({
      where: { OR: [{ createdAt: { gt: since } }, { weaningDate: { gte: mutableSince } }] },
    }),
    prisma.kitDeathLog.findMany({
      where: { OR: [{ createdAt: { gt: since } }, { deathDate: { gte: mutableSince } }] },
    }),
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
    kitDeathLogs,
    tombstones,
  };
}
