-- CreateTable
CREATE TABLE "PregnancyTestLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "doeId" TEXT NOT NULL,
    "buckId" TEXT,
    "matingDate" DATETIME NOT NULL,
    "testDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PregnancyTestLog_doeId_fkey" FOREIGN KEY ("doeId") REFERENCES "Rabbit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PregnancyTestLog_buckId_fkey" FOREIGN KEY ("buckId") REFERENCES "Rabbit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PregnancyTestLog_doeId_idx" ON "PregnancyTestLog"("doeId");

-- CreateIndex
CREATE INDEX "PregnancyTestLog_testDate_idx" ON "PregnancyTestLog"("testDate");
