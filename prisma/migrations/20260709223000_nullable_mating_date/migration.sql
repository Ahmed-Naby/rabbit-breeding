-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Breeding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buckId" TEXT NOT NULL,
    "doeId" TEXT NOT NULL,
    "matingDate" DATETIME,
    "expectedKindlingDate" DATETIME NOT NULL,
    "actualKindlingDate" DATETIME,
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "pregnancyTestResult" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Breeding_buckId_fkey" FOREIGN KEY ("buckId") REFERENCES "Rabbit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Breeding_doeId_fkey" FOREIGN KEY ("doeId") REFERENCES "Rabbit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Breeding" ("actualKindlingDate", "buckId", "createdAt", "doeId", "expectedKindlingDate", "id", "matingDate", "notes", "outcome", "pregnancyTestResult", "updatedAt") SELECT "actualKindlingDate", "buckId", "createdAt", "doeId", "expectedKindlingDate", "id", "matingDate", "notes", "outcome", "pregnancyTestResult", "updatedAt" FROM "Breeding";
DROP TABLE "Breeding";
ALTER TABLE "new_Breeding" RENAME TO "Breeding";
CREATE INDEX "Breeding_outcome_idx" ON "Breeding"("outcome");
CREATE INDEX "Breeding_expectedKindlingDate_idx" ON "Breeding"("expectedKindlingDate");
CREATE INDEX "Breeding_doeId_idx" ON "Breeding"("doeId");
CREATE INDEX "Breeding_buckId_idx" ON "Breeding"("buckId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
