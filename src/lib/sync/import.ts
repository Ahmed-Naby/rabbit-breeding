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
  feedLogs: Prisma.FeedLogCreateManyInput[];
  transactions: Prisma.TransactionCreateManyInput[];
  kitStockMovements: Prisma.KitStockMovementCreateManyInput[];
  breeds: Prisma.BreedCreateManyInput[];
  pregnancyTestLogs: Prisma.PregnancyTestLogCreateManyInput[];
  kindlingLogs: Prisma.KindlingLogCreateManyInput[];
  fosterLogs: Prisma.FosterLogCreateManyInput[];
};

const REQUIRED_KEYS: (keyof FullExportData)[] = [
  "rabbits", "breedings", "litters", "weightRecords", "healthRecords",
  "feedLogs", "transactions", "kitStockMovements", "breeds",
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
 */
export async function runFullImport(data: FullExportData): Promise<{ dataResetAt: string }> {
  const dataResetAt = new Date();

  await prisma.$transaction(
    async (tx) => {
      await deleteAllFarmData(tx);

      if (data.breeds.length) await tx.breed.createMany({ data: data.breeds });

      const rabbitRefs = data.rabbits.map((r) => ({
        id: r.id as string,
        sireId: (r.sireId ?? null) as string | null,
        damId: (r.damId ?? null) as string | null,
        litterId: (r.litterId ?? null) as string | null,
      }));
      if (data.rabbits.length) {
        await tx.rabbit.createMany({
          data: data.rabbits.map((r) => ({ ...r, sireId: null, damId: null, litterId: null })),
        });
      }

      if (data.breedings.length) await tx.breeding.createMany({ data: data.breedings });
      if (data.litters.length) await tx.litter.createMany({ data: data.litters });

      for (const ref of rabbitRefs) {
        if (ref.sireId || ref.damId || ref.litterId) {
          await tx.rabbit.update({
            where: { id: ref.id },
            data: { sireId: ref.sireId, damId: ref.damId, litterId: ref.litterId },
          });
        }
      }

      if (data.weightRecords.length) await tx.weightRecord.createMany({ data: data.weightRecords });
      if (data.healthRecords.length) await tx.healthRecord.createMany({ data: data.healthRecords });
      if (data.transactions.length) await tx.transaction.createMany({ data: data.transactions });
      if (data.kitStockMovements.length) await tx.kitStockMovement.createMany({ data: data.kitStockMovements });
      if (data.pregnancyTestLogs.length) await tx.pregnancyTestLog.createMany({ data: data.pregnancyTestLogs });
      if (data.kindlingLogs.length) await tx.kindlingLog.createMany({ data: data.kindlingLogs });
      if (data.fosterLogs.length) await tx.fosterLog.createMany({ data: data.fosterLogs });
      if (data.feedLogs.length) await tx.feedLog.createMany({ data: data.feedLogs });

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
    { timeout: 30_000 },
  );

  return { dataResetAt: dataResetAt.toISOString() };
}
