-- CreateTable: the permanent nursing-kit death archive. Until now «تسجيل نافق»
-- only moved units from Litter.bornAlive to Litter.bornDead, and both are reused
-- by the doe's next cycle — so the death had no date, no row, and no way to
-- appear in سجل النفوق or in the اليومية of the day it happened.
CREATE TABLE "KitDeathLog" (
    "farmId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "doeId" TEXT NOT NULL,
    "breedingId" TEXT,
    "kindlingDate" TIMESTAMP(3),
    "deathDate" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitDeathLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KitDeathLog_doeId_idx" ON "KitDeathLog"("doeId");

-- CreateIndex
CREATE INDEX "KitDeathLog_deathDate_idx" ON "KitDeathLog"("deathDate");

-- CreateIndex
CREATE INDEX "KitDeathLog_farmId_idx" ON "KitDeathLog"("farmId");

-- AddForeignKey
ALTER TABLE "KitDeathLog" ADD CONSTRAINT "KitDeathLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitDeathLog" ADD CONSTRAINT "KitDeathLog_doeId_fkey" FOREIGN KEY ("doeId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- No backfill. Deaths recorded before this table exist only as the per-cycle
-- difference bornDead - bornDeadAtKindling on the CURRENT cycle of each doe,
-- and that difference carries no date — inventing one (the kindling date, say)
-- would put a fabricated event in an archive whose whole purpose is to be
-- trusted. Those older losses stay visible where they always were: the «نافق»
-- column of سجل الولادة and نسبة النجاح in سجل الفطام. An accepted, disclosed
-- gap for history recorded before this table existed.
