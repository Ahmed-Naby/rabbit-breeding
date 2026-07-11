-- AlterTable
ALTER TABLE "Rabbit" ADD COLUMN "doeState" TEXT NOT NULL DEFAULT 'empty';

-- CreateIndex
CREATE INDEX "Rabbit_doeState_idx" ON "Rabbit"("doeState");
