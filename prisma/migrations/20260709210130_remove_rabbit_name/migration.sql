-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Rabbit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tagId" TEXT NOT NULL,
    "breed" TEXT,
    "color" TEXT,
    "sex" TEXT NOT NULL DEFAULT 'unknown',
    "dateOfBirth" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "cage" TEXT,
    "acquiredDate" DATETIME,
    "acquiredFrom" TEXT,
    "notes" TEXT,
    "photoUrl" TEXT,
    "sireId" TEXT,
    "damId" TEXT,
    "litterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Rabbit_sireId_fkey" FOREIGN KEY ("sireId") REFERENCES "Rabbit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Rabbit_damId_fkey" FOREIGN KEY ("damId") REFERENCES "Rabbit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Rabbit_litterId_fkey" FOREIGN KEY ("litterId") REFERENCES "Litter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Rabbit" ("id", "tagId", "breed", "color", "sex", "dateOfBirth", "status", "cage", "acquiredDate", "acquiredFrom", "notes", "photoUrl", "sireId", "damId", "litterId", "createdAt", "updatedAt") SELECT "id", "tagId", "breed", "color", "sex", "dateOfBirth", "status", "cage", "acquiredDate", "acquiredFrom", "notes", "photoUrl", "sireId", "damId", "litterId", "createdAt", "updatedAt" FROM "Rabbit";
DROP TABLE "Rabbit";
ALTER TABLE "new_Rabbit" RENAME TO "Rabbit";
CREATE UNIQUE INDEX "Rabbit_tagId_key" ON "Rabbit"("tagId");
CREATE INDEX "Rabbit_status_idx" ON "Rabbit"("status");
CREATE INDEX "Rabbit_sex_idx" ON "Rabbit"("sex");
CREATE INDEX "Rabbit_breed_idx" ON "Rabbit"("breed");
CREATE INDEX "Rabbit_sireId_idx" ON "Rabbit"("sireId");
CREATE INDEX "Rabbit_damId_idx" ON "Rabbit"("damId");
PRAGMA foreign_keys=ON;
