-- AlterTable
ALTER TABLE "Breeding" ADD COLUMN     "palpationConfirmedDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ResorptionLog" (
    "farmId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "doeId" TEXT NOT NULL,
    "buckId" TEXT,
    "matingDate" TIMESTAMP(3) NOT NULL,
    "resorptionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResorptionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResorptionLog_doeId_idx" ON "ResorptionLog"("doeId");

-- CreateIndex
CREATE INDEX "ResorptionLog_resorptionDate_idx" ON "ResorptionLog"("resorptionDate");

-- CreateIndex
CREATE INDEX "ResorptionLog_farmId_idx" ON "ResorptionLog"("farmId");

-- AddForeignKey
ALTER TABLE "ResorptionLog" ADD CONSTRAINT "ResorptionLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResorptionLog" ADD CONSTRAINT "ResorptionLog_doeId_fkey" FOREIGN KEY ("doeId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResorptionLog" ADD CONSTRAINT "ResorptionLog_buckId_fkey" FOREIGN KEY ("buckId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
