import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Deletes every farm-data row, in FK-safe order (Restrict relations —
 * FosterLog/KindlingLog/PregnancyTestLog/Breeding all reference Rabbit with
 * Restrict, so they must go before Rabbit itself; Litter must go before
 * Breeding for the same reason). Shared by runWipe() (which resets Settings
 * to defaults afterward) and runFullImport() (which restores Settings from
 * a snapshot afterward) so the two never drift apart.
 */
export async function deleteAllFarmData(tx: Tx): Promise<void> {
  await tx.kitStockMovement.deleteMany();
  await tx.transaction.deleteMany();
  await tx.healthRecord.deleteMany();
  await tx.weightRecord.deleteMany();
  await tx.fosterLog.deleteMany();
  await tx.kindlingLog.deleteMany();
  await tx.pregnancyTestLog.deleteMany();
  await tx.litter.deleteMany();
  await tx.breeding.deleteMany();
  await tx.rabbit.deleteMany();
  await tx.breed.deleteMany();
}
