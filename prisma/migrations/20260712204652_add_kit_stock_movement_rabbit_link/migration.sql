-- AlterTable
ALTER TABLE "KitStockMovement" ADD COLUMN     "rabbitId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "KitStockMovement_rabbitId_key" ON "KitStockMovement"("rabbitId");

-- AddForeignKey
ALTER TABLE "KitStockMovement" ADD CONSTRAINT "KitStockMovement_rabbitId_fkey" FOREIGN KEY ("rabbitId") REFERENCES "Rabbit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
