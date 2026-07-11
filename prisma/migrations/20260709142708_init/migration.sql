-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "weightUnit" TEXT NOT NULL DEFAULT 'kg',
    "gestationDays" INTEGER NOT NULL DEFAULT 31,
    "gestationWindowDays" INTEGER NOT NULL DEFAULT 3,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Rabbit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tagId" TEXT NOT NULL,
    "name" TEXT,
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

-- CreateTable
CREATE TABLE "Breeding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buckId" TEXT NOT NULL,
    "doeId" TEXT NOT NULL,
    "matingDate" DATETIME NOT NULL,
    "expectedKindlingDate" DATETIME NOT NULL,
    "actualKindlingDate" DATETIME,
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Breeding_buckId_fkey" FOREIGN KEY ("buckId") REFERENCES "Rabbit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Breeding_doeId_fkey" FOREIGN KEY ("doeId") REFERENCES "Rabbit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Litter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "breedingId" TEXT NOT NULL,
    "kindlingDate" DATETIME NOT NULL,
    "bornAlive" INTEGER NOT NULL DEFAULT 0,
    "bornDead" INTEGER NOT NULL DEFAULT 0,
    "weaned" INTEGER,
    "weaningDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Litter_breedingId_fkey" FOREIGN KEY ("breedingId") REFERENCES "Breeding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeightRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rabbitId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "weightGrams" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeightRecord_rabbitId_fkey" FOREIGN KEY ("rabbitId") REFERENCES "Rabbit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HealthRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rabbitId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "nextDueDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HealthRecord_rabbitId_fkey" FOREIGN KEY ("rabbitId") REFERENCES "Rabbit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeedLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "feedType" TEXT NOT NULL,
    "quantityG" INTEGER,
    "costCents" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rabbitId" TEXT,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_rabbitId_fkey" FOREIGN KEY ("rabbitId") REFERENCES "Rabbit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Rabbit_tagId_key" ON "Rabbit"("tagId");

-- CreateIndex
CREATE INDEX "Rabbit_status_idx" ON "Rabbit"("status");

-- CreateIndex
CREATE INDEX "Rabbit_sex_idx" ON "Rabbit"("sex");

-- CreateIndex
CREATE INDEX "Rabbit_breed_idx" ON "Rabbit"("breed");

-- CreateIndex
CREATE INDEX "Rabbit_sireId_idx" ON "Rabbit"("sireId");

-- CreateIndex
CREATE INDEX "Rabbit_damId_idx" ON "Rabbit"("damId");

-- CreateIndex
CREATE INDEX "Breeding_outcome_idx" ON "Breeding"("outcome");

-- CreateIndex
CREATE INDEX "Breeding_expectedKindlingDate_idx" ON "Breeding"("expectedKindlingDate");

-- CreateIndex
CREATE INDEX "Breeding_doeId_idx" ON "Breeding"("doeId");

-- CreateIndex
CREATE INDEX "Breeding_buckId_idx" ON "Breeding"("buckId");

-- CreateIndex
CREATE UNIQUE INDEX "Litter_breedingId_key" ON "Litter"("breedingId");

-- CreateIndex
CREATE INDEX "Litter_kindlingDate_idx" ON "Litter"("kindlingDate");

-- CreateIndex
CREATE INDEX "WeightRecord_rabbitId_date_idx" ON "WeightRecord"("rabbitId", "date");

-- CreateIndex
CREATE INDEX "HealthRecord_rabbitId_date_idx" ON "HealthRecord"("rabbitId", "date");

-- CreateIndex
CREATE INDEX "HealthRecord_nextDueDate_idx" ON "HealthRecord"("nextDueDate");

-- CreateIndex
CREATE INDEX "FeedLog_date_idx" ON "FeedLog"("date");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "Transaction_category_idx" ON "Transaction"("category");

-- CreateIndex
CREATE INDEX "Transaction_rabbitId_idx" ON "Transaction"("rabbitId");
