-- AlterTable
-- DEFAULT CURRENT_TIMESTAMP backfills existing rows (WeightRecord already has
-- data); matches createdAt's own default style on the same table.
ALTER TABLE "WeightRecord" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "SyncDevice" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncOperation" (
    "id" TEXT NOT NULL,
    "clientOpId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "opType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "clientAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "resultMessage" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncOperation_clientOpId_key" ON "SyncOperation"("clientOpId");

-- CreateIndex
CREATE INDEX "SyncOperation_deviceId_idx" ON "SyncOperation"("deviceId");

-- CreateIndex
CREATE INDEX "SyncOperation_opType_idx" ON "SyncOperation"("opType");

-- AddForeignKey
ALTER TABLE "SyncOperation" ADD CONSTRAINT "SyncOperation_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SyncDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
