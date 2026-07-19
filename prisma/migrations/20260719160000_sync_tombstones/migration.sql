-- CreateTable
CREATE TABLE "SyncTombstone" (
    "farmId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncTombstone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncTombstone_farmId_deletedAt_idx" ON "SyncTombstone"("farmId", "deletedAt");

-- AddForeignKey
ALTER TABLE "SyncTombstone" ADD CONSTRAINT "SyncTombstone_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
