import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteAllFarmData } from "./delete-all";

/** The shape produced by runFullExport() — the only accepted input here. */
export type FullExportData = {
  settings: Prisma.SettingsCreateInput | null;
  rabbits: Prisma.RabbitCreateManyInput[];
  breedings: Prisma.BreedingCreateManyInput[];
  litters: Prisma.LitterCreateManyInput[];
  weightRecords: Prisma.WeightRecordCreateManyInput[];
  healthRecords: Prisma.HealthRecordCreateManyInput[];
  transactions: Prisma.TransactionCreateManyInput[];
  kitStockMovements: Prisma.KitStockMovementCreateManyInput[];
  breeds: Prisma.BreedCreateManyInput[];
  pregnancyTestLogs: Prisma.PregnancyTestLogCreateManyInput[];
  kindlingLogs: Prisma.KindlingLogCreateManyInput[];
  fosterLogs: Prisma.FosterLogCreateManyInput[];
};

const REQUIRED_KEYS: (keyof FullExportData)[] = [
  "rabbits", "breedings", "litters", "weightRecords", "healthRecords",
  "transactions", "kitStockMovements", "breeds",
  "pregnancyTestLogs", "kindlingLogs", "fosterLogs",
];

/** Cheap structural check — not full validation, just enough to reject an obviously-wrong file (e.g. a local SQLite backup) before touching the database. */
export function looksLikeFullExportData(value: unknown): value is FullExportData {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return REQUIRED_KEYS.every((key) => Array.isArray(obj[key]));
}

/**
 * Replaces every farm-data row in the central database with the contents of
 * a previously downloaded runFullExport() snapshot — the "restore from
 * online backup" danger-zone action, symmetric to runWipe(). Wipes first
 * (deleteAllFarmData, same FK-safe order the wipe action uses) then
 * re-inserts, all inside one transaction so a mid-import failure rolls back
 * to the pre-import state rather than leaving the database half-restored.
 *
 * Rabbit rows form a dependency cycle with Breeding/Litter (Rabbit.litterId
 * -> Litter -> Litter.breedingId -> Breeding -> Breeding.buckId/doeId ->
 * Rabbit), so rabbits are first inserted with sireId/damId/litterId
 * stripped, then Breeding and Litter are inserted (which can now reference
 * the rabbits), then a second pass patches each rabbit's sireId/damId/
 * litterId back in.
 *
 * Settings is restored from the snapshot's actual values (unlike runWipe(),
 * which resets to defaults) but still stamped with a fresh dataResetAt so
 * every syncing device discovers the wholesale replacement and
 * re-bootstraps instead of incrementally pulling (which can't detect
 * deletions/replacements, only additions/updates).
 *
 * The snapshot is sanitized before insertion rather than trusted: it comes
 * from a device's local SQLite mirror, which has no FK enforcement or
 * unique constraints and accumulates crud over its lifetime (orphaned
 * weight records for long-deleted rabbits, duplicate rows layered by old
 * app versions). One bad row must degrade to "that row is skipped", never
 * to the entire restore failing with a 500 — which is what a raw
 * createMany does on the first FK/unique violation.
 */
export async function runFullImport(data: FullExportData): Promise<{ dataResetAt: string }> {
  const dataResetAt = new Date();

  // -- sanitize --------------------------------------------------------------
  const dedupeById = <T extends { id?: unknown }>(rows: T[]): T[] => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      const id = r.id as string | undefined;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };
  const dedupeBy = <T>(rows: T[], key: (r: T) => string | null): T[] => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      const k = key(r);
      if (k === null) return true;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const breeds = dedupeBy(dedupeById(data.breeds), (b) => b.name);
  // tagId is only unique per sex (and NULLs are unconstrained) — mirror
  // Postgres's @@unique([tagId, sex]) here so a duplicate pair can't abort
  // the whole insert.
  const rabbits = dedupeBy(dedupeById(data.rabbits), (r) => (r.tagId ? `${r.tagId}\u0000${r.sex}` : null));
  const rabbitIds = new Set(rabbits.map((r) => r.id as string));

  const breedings = dedupeById(data.breedings)
    .filter((b) => rabbitIds.has(b.doeId as string))
    .map((b) => ({ ...b, buckId: rabbitIds.has(b.buckId as string) ? b.buckId : null }));
  const breedingIds = new Set(breedings.map((b) => b.id as string));

  const litters = dedupeBy(dedupeById(data.litters), (l) => l.breedingId as string).filter((l) =>
    breedingIds.has(l.breedingId as string)
  );
  const litterIds = new Set(litters.map((l) => l.id as string));

  const transactions = dedupeById(data.transactions).map((t) => ({
    ...t,
    rabbitId: rabbitIds.has(t.rabbitId as string) ? t.rabbitId : null,
  }));
  const transactionIds = new Set(transactions.map((t) => t.id as string));

  const weightRecords = dedupeById(data.weightRecords).filter((w) => rabbitIds.has(w.rabbitId as string));
  const healthRecords = dedupeById(data.healthRecords).filter((h) => rabbitIds.has(h.rabbitId as string));
  const kitStockMovements = dedupeById(data.kitStockMovements).map((m) => ({
    ...m,
    rabbitId: rabbitIds.has(m.rabbitId as string) ? m.rabbitId : null,
    transactionId: transactionIds.has(m.transactionId as string) ? m.transactionId : null,
  }));
  const pregnancyTestLogs = dedupeById(data.pregnancyTestLogs)
    .filter((log) => rabbitIds.has(log.doeId as string))
    .map((log) => ({ ...log, buckId: rabbitIds.has(log.buckId as string) ? log.buckId : null }));
  const kindlingLogs = dedupeById(data.kindlingLogs)
    .filter((log) => rabbitIds.has(log.doeId as string))
    .map((log) => ({ ...log, buckId: rabbitIds.has(log.buckId as string) ? log.buckId : null }));
  const fosterLogs = dedupeById(data.fosterLogs).filter(
    (f) => rabbitIds.has(f.fromDoeId as string) && rabbitIds.has(f.toDoeId as string)
  );

  // -- insert ----------------------------------------------------------------
  await prisma.$transaction(
    async (tx) => {
      await deleteAllFarmData(tx);

      if (breeds.length) await tx.breed.createMany({ data: breeds });

      const rabbitRefs = rabbits.map((r) => ({
        id: r.id as string,
        sireId: rabbitIds.has(r.sireId as string) ? (r.sireId as string) : null,
        damId: rabbitIds.has(r.damId as string) ? (r.damId as string) : null,
        litterId: litterIds.has(r.litterId as string) ? (r.litterId as string) : null,
      }));
      if (rabbits.length) {
        await tx.rabbit.createMany({
          data: rabbits.map((r) => ({ ...r, sireId: null, damId: null, litterId: null })),
        });
      }

      if (breedings.length) await tx.breeding.createMany({ data: breedings });
      if (litters.length) await tx.litter.createMany({ data: litters });

      for (const ref of rabbitRefs) {
        if (ref.sireId || ref.damId || ref.litterId) {
          await tx.rabbit.update({
            where: { id: ref.id },
            data: { sireId: ref.sireId, damId: ref.damId, litterId: ref.litterId },
          });
        }
      }

      if (weightRecords.length) await tx.weightRecord.createMany({ data: weightRecords });
      if (healthRecords.length) await tx.healthRecord.createMany({ data: healthRecords });
      if (transactions.length) await tx.transaction.createMany({ data: transactions });
      if (kitStockMovements.length) await tx.kitStockMovement.createMany({ data: kitStockMovements });
      if (pregnancyTestLogs.length) await tx.pregnancyTestLog.createMany({ data: pregnancyTestLogs });
      if (kindlingLogs.length) await tx.kindlingLog.createMany({ data: kindlingLogs });
      if (fosterLogs.length) await tx.fosterLog.createMany({ data: fosterLogs });

      const s = data.settings;
      const settingsData = {
        weightUnit: s?.weightUnit ?? "kg",
        gestationDays: s?.gestationDays ?? 31,
        gestationWindowDays: s?.gestationWindowDays ?? 3,
        pregnancyTestDays: s?.pregnancyTestDays ?? 10,
        weaningDays: s?.weaningDays ?? 28,
        nestBoxDays: s?.nestBoxDays ?? 27,
        matingWeightGrams: s?.matingWeightGrams ?? 3000,
        rebreedAfterKindlingDays: s?.rebreedAfterKindlingDays ?? 0,
        currency: s?.currency ?? "USD",
        dataResetAt,
      };
      await tx.settings.upsert({
        where: { id: 1 },
        create: { id: 1, ...settingsData },
        update: settingsData,
      });
    },
    // Generous ceiling — a real farm snapshot is a few hundred rows per
    // table and the inserts are batched createMany calls, but a Neon cold
    // start plus the per-rabbit pedigree-patch loop can stack up.
    { timeout: 120_000 },
  );

  return { dataResetAt: dataResetAt.toISOString() };
}
