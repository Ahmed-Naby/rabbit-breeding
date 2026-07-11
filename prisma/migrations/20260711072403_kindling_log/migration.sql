-- CreateTable
CREATE TABLE "KindlingLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "doeId" TEXT NOT NULL,
    "buckId" TEXT,
    "matingDate" DATETIME,
    "kindlingDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KindlingLog_doeId_fkey" FOREIGN KEY ("doeId") REFERENCES "Rabbit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "KindlingLog_buckId_fkey" FOREIGN KEY ("buckId") REFERENCES "Rabbit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "KindlingLog_doeId_idx" ON "KindlingLog"("doeId");

-- CreateIndex
CREATE INDEX "KindlingLog_kindlingDate_idx" ON "KindlingLog"("kindlingDate");
