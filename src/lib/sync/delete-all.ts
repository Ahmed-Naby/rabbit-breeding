// Structural type instead of Prisma.TransactionClient so it accepts the
// tenant-extended client's transaction handle (see prisma.ts $extends) —
// the extension changes the client's nominal type but not this shape.
type Tx = {
  [M in
    | "kitStockMovement" | "transaction" | "healthRecord" | "weightRecord"
    | "fosterLog" | "kindlingLog" | "weaningLog" | "pregnancyTestLog"
    | "matingLog" | "resorptionLog" | "litter" | "breeding" | "breed"]: {
    deleteMany(): Promise<unknown>;
  };
} & {
  rabbit: {
    deleteMany(): Promise<unknown>;
    updateMany(args: { data: { doeState: string } }): Promise<unknown>;
  };
};

/**
 * Deletes every farm-data row of the ACTIVE farm. It clears all operations
 * first (which removes every log/breeding/litter that references Rabbit with
 * onDelete: Restrict — including MatingLog and ResorptionLog, both of which an
 * earlier hand-maintained list here omitted, so a wipe once any mating/
 * resorption row existed would fail on the rabbit delete), then removes the
 * rabbits and the breed registry. The doeState reset inside
 * deleteAllFarmOperations is a harmless no-op here (those rabbits are deleted
 * immediately after). Farm scoping is invisible: every query is filtered to
 * the current farm by the tenant extension in prisma.ts. Shared by runWipe()
 * and runFullImport() so the two never drift apart.
 */
export async function deleteAllFarmData(tx: Tx): Promise<void> {
  await deleteAllFarmOperations(tx);
  await tx.rabbit.deleteMany();
  await tx.breed.deleteMany();
}

/**
 * Deletes every recorded OPERATION of the ACTIVE farm — the append-only logs
 * (mating/pregnancy-test/resorption/kindling/weaning/foster), the live
 * Breeding/Litter cycle rows, and the weight/health/finance/stock records —
 * while KEEPING the herd itself: rabbits, bucks, and the breed registry all
 * survive. This backs the "reset operations only" danger-zone action.
 *
 * FK-safe order matters here even though rabbits stay: every log's doe/buck FK
 * and Breeding's doe/buck FK are onDelete: Restrict, so those rows are deleted
 * outright (deleting a log row that *points at* a surviving rabbit is always
 * fine — Restrict only blocks deleting the referenced rabbit). Litter is
 * deleted before Breeding (Litter.breedingId → Breeding), and Rabbit.litterId
 * (a kit's birth litter) is onDelete: SetNull, so a surviving rabbit simply
 * loses that back-link.
 *
 * Finally every rabbit's doeState is reset to "empty": with the breedings and
 * litters gone, a doe left "pregnant"/"nursing"/"bred" would show a phantom
 * reproductive cycle on the board with nothing behind it (bucks are already
 * "empty", so the blanket update is a no-op for them).
 */
export async function deleteAllFarmOperations(tx: Tx): Promise<void> {
  await tx.kitStockMovement.deleteMany();
  await tx.transaction.deleteMany();
  await tx.healthRecord.deleteMany();
  await tx.weightRecord.deleteMany();
  await tx.fosterLog.deleteMany();
  await tx.kindlingLog.deleteMany();
  await tx.weaningLog.deleteMany();
  await tx.pregnancyTestLog.deleteMany();
  await tx.resorptionLog.deleteMany();
  await tx.matingLog.deleteMany();
  await tx.litter.deleteMany();
  await tx.breeding.deleteMany();
  await tx.rabbit.updateMany({ data: { doeState: "empty" } });
}
