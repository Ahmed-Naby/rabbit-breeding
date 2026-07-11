-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "weightUnit" TEXT NOT NULL DEFAULT 'kg',
    "gestationDays" INTEGER NOT NULL DEFAULT 31,
    "gestationWindowDays" INTEGER NOT NULL DEFAULT 3,
    "pregnancyTestDays" INTEGER NOT NULL DEFAULT 10,
    "weaningDays" INTEGER NOT NULL DEFAULT 28,
    "matingWeightGrams" INTEGER NOT NULL DEFAULT 3000,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("createdAt", "currency", "gestationDays", "gestationWindowDays", "id", "matingWeightGrams", "pregnancyTestDays", "updatedAt", "weightUnit") SELECT "createdAt", "currency", "gestationDays", "gestationWindowDays", "id", "matingWeightGrams", "pregnancyTestDays", "updatedAt", "weightUnit" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
