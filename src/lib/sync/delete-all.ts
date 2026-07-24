// Structural type instead of Prisma.TransactionClient so it accepts the
// tenant-extended client's transaction handle (see prisma.ts $extends) —
// the extension changes the client's nominal type but not this shape.
type Tx = {
  [M in
    | "kitStockMovement" | "transaction" | "healthRecord" | "weightRecord"
    | "fosterLog" | "kindlingLog" | "weaningLog" | "pregnancyTestLog" | "litter"
    | "breeding" | "rabbit" | "breed"]: { deleteMany(): Promise<unknown> };
};

/**
 * Deletes every farm-data row of the ACTIVE farm, in FK-safe order (Restrict
 * relations — FosterLog/KindlingLog/WeaningLog/PregnancyTestLog/Breeding all
 * reference Rabbit with Restrict, so they must go before Rabbit itself; Litter
 * must go before Breeding for the same reason). The farm scoping is invisible here:
 * every deleteMany is filtered to the current farm by the tenant extension
 * in prisma.ts. Shared by runWipe() and runFullImport() so the two never
 * drift apart.
 */
export async function deleteAllFarmData(tx: Tx): Promise<void> {
  await tx.kitStockMovement.deleteMany();
  await tx.transaction.deleteMany();
  await tx.healthRecord.deleteMany();
  await tx.weightRecord.deleteMany();
  await tx.fosterLog.deleteMany();
  await tx.kindlingLog.deleteMany();
  await tx.weaningLog.deleteMany();
  await tx.pregnancyTestLog.deleteMany();
  await tx.litter.deleteMany();
  await tx.breeding.deleteMany();
  await tx.rabbit.deleteMany();
  await tx.breed.deleteMany();
}
