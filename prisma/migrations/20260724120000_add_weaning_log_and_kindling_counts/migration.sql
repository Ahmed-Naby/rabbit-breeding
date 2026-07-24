-- AlterTable: KindlingLog gains a breedingId link and a born-count snapshot,
-- so live count edits on the does board can be mirrored back into the current
-- cycle's row while older rows stay frozen.
ALTER TABLE "KindlingLog" ADD COLUMN "breedingId" TEXT;
ALTER TABLE "KindlingLog" ADD COLUMN "bornAlive" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "KindlingLog" ADD COLUMN "bornDead" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "KindlingLog_breedingId_idx" ON "KindlingLog"("breedingId");

-- CreateTable
CREATE TABLE "WeaningLog" (
    "farmId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "doeId" TEXT NOT NULL,
    "buckId" TEXT,
    "breedingId" TEXT,
    "kindlingDate" TIMESTAMP(3),
    "weaningDate" TIMESTAMP(3) NOT NULL,
    "bornAlive" INTEGER NOT NULL DEFAULT 0,
    "bornDead" INTEGER NOT NULL DEFAULT 0,
    "weaned" INTEGER,
    "weaningWeightGrams" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeaningLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeaningLog_doeId_idx" ON "WeaningLog"("doeId");

-- CreateIndex
CREATE INDEX "WeaningLog_weaningDate_idx" ON "WeaningLog"("weaningDate");

-- CreateIndex
CREATE INDEX "WeaningLog_breedingId_idx" ON "WeaningLog"("breedingId");

-- CreateIndex
CREATE INDEX "WeaningLog_farmId_idx" ON "WeaningLog"("farmId");

-- AddForeignKey
ALTER TABLE "WeaningLog" ADD CONSTRAINT "WeaningLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeaningLog" ADD CONSTRAINT "WeaningLog_doeId_fkey" FOREIGN KEY ("doeId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeaningLog" ADD CONSTRAINT "WeaningLog_buckId_fkey" FOREIGN KEY ("buckId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill KindlingLog.breedingId + born counts from the Breeding/Litter that
-- match on (doeId, kindlingDate). Only the doe's CURRENT cycle still has a
-- Breeding row whose actualKindlingDate equals the log's kindlingDate, so older
-- reused-cycle rows keep breedingId NULL and counts 0 — an accepted, disclosed
-- gap for history recorded before this feature existed.
UPDATE "KindlingLog" kl
SET "breedingId" = b.id,
    "bornAlive"  = COALESCE(l."bornAlive", 0),
    "bornDead"   = COALESCE(l."bornDead", 0)
FROM "Breeding" b
LEFT JOIN "Litter" l ON l."breedingId" = b.id
WHERE b."doeId" = kl."doeId"
  AND b."actualKindlingDate" = kl."kindlingDate";

-- Backfill WeaningLog: one permanent row per litter that has already been
-- weaned, recovered from the live Litter/Breeding rows. Deterministic id
-- ('wl_' || litterId) keeps the backfill idempotent.
INSERT INTO "WeaningLog" ("id", "farmId", "doeId", "buckId", "breedingId", "kindlingDate", "weaningDate", "bornAlive", "bornDead", "weaned", "weaningWeightGrams", "createdAt")
SELECT
  'wl_' || l.id,
  b."farmId",
  b."doeId",
  b."buckId",
  b.id,
  l."kindlingDate",
  l."weaningDate",
  COALESCE(l."bornAlive", 0),
  COALESCE(l."bornDead", 0),
  l."weaned",
  l."weaningWeightGrams",
  now()
FROM "Litter" l
JOIN "Breeding" b ON b.id = l."breedingId"
WHERE l."weaningDate" IS NOT NULL;
