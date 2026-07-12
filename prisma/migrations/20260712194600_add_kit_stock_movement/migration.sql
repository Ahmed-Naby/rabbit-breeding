-- CreateTable
CREATE TABLE "KitStockMovement" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "weightGrams" INTEGER,
    "pricePerKgCents" INTEGER,
    "amountCents" INTEGER,
    "transactionId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KitStockMovement_transactionId_key" ON "KitStockMovement"("transactionId");

-- CreateIndex
CREATE INDEX "KitStockMovement_date_idx" ON "KitStockMovement"("date");

-- CreateIndex
CREATE INDEX "KitStockMovement_type_idx" ON "KitStockMovement"("type");

-- AddForeignKey
ALTER TABLE "KitStockMovement" ADD CONSTRAINT "KitStockMovement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
