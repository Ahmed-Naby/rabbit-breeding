-- CreateTable
CREATE TABLE "FosterLog" (
    "id" TEXT NOT NULL,
    "fromDoeId" TEXT NOT NULL,
    "toDoeId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FosterLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FosterLog_fromDoeId_idx" ON "FosterLog"("fromDoeId");

-- CreateIndex
CREATE INDEX "FosterLog_toDoeId_idx" ON "FosterLog"("toDoeId");

-- CreateIndex
CREATE INDEX "FosterLog_date_idx" ON "FosterLog"("date");

-- AddForeignKey
ALTER TABLE "FosterLog" ADD CONSTRAINT "FosterLog_fromDoeId_fkey" FOREIGN KEY ("fromDoeId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FosterLog" ADD CONSTRAINT "FosterLog_toDoeId_fkey" FOREIGN KEY ("toDoeId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
