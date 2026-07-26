-- CreateTable: the permanent nest-box archive. Breeding.nestBoxDate is a
-- per-cycle checklist flag that markMated/markMatingFailed/clearDoeRow reset to
-- null, so an installation disappeared from the اليومية of the day it happened
-- the moment the doe started her next cycle. This row never moves.
CREATE TABLE "NestBoxLog" (
    "farmId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "doeId" TEXT NOT NULL,
    "breedingId" TEXT,
    "nestBoxDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NestBoxLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NestBoxLog_doeId_idx" ON "NestBoxLog"("doeId");

-- CreateIndex
CREATE INDEX "NestBoxLog_nestBoxDate_idx" ON "NestBoxLog"("nestBoxDate");

-- CreateIndex
CREATE INDEX "NestBoxLog_farmId_idx" ON "NestBoxLog"("farmId");

-- AddForeignKey
ALTER TABLE "NestBoxLog" ADD CONSTRAINT "NestBoxLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NestBoxLog" ADD CONSTRAINT "NestBoxLog_doeId_fkey" FOREIGN KEY ("doeId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill one row per Breeding that still carries a nestBoxDate. Only the
-- doe's CURRENT cycle does — installations from cycles already closed were
-- nulled out and are unrecoverable, an accepted, disclosed gap for history
-- recorded before this table existed. Deterministic id ('nbl_' || breedingId)
-- keeps the backfill idempotent.
INSERT INTO "NestBoxLog" ("id", "farmId", "doeId", "breedingId", "nestBoxDate", "createdAt")
SELECT
  'nbl_' || b.id,
  b."farmId",
  b."doeId",
  b.id,
  b."nestBoxDate",
  now()
FROM "Breeding" b
WHERE b."nestBoxDate" IS NOT NULL;
