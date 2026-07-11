-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "weightUnit" TEXT NOT NULL DEFAULT 'kg',
    "gestationDays" INTEGER NOT NULL DEFAULT 31,
    "gestationWindowDays" INTEGER NOT NULL DEFAULT 3,
    "pregnancyTestDays" INTEGER NOT NULL DEFAULT 10,
    "weaningDays" INTEGER NOT NULL DEFAULT 28,
    "nestBoxDays" INTEGER NOT NULL DEFAULT 27,
    "matingWeightGrams" INTEGER NOT NULL DEFAULT 3000,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rabbit" (
    "id" TEXT NOT NULL,
    "tagId" TEXT,
    "breed" TEXT,
    "color" TEXT,
    "sex" TEXT NOT NULL DEFAULT 'unknown',
    "dateOfBirth" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "doeState" TEXT NOT NULL DEFAULT 'empty',
    "cage" TEXT,
    "origin" TEXT,
    "movedToHerdPen" BOOLEAN NOT NULL DEFAULT false,
    "acquiredDate" TIMESTAMP(3),
    "acquiredFrom" TEXT,
    "notes" TEXT,
    "photoUrl" TEXT,
    "sireId" TEXT,
    "damId" TEXT,
    "litterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rabbit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Breeding" (
    "id" TEXT NOT NULL,
    "buckId" TEXT,
    "doeId" TEXT NOT NULL,
    "matingDate" TIMESTAMP(3),
    "expectedKindlingDate" TIMESTAMP(3) NOT NULL,
    "actualKindlingDate" TIMESTAMP(3),
    "nestBoxDate" TIMESTAMP(3),
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "pregnancyTestResult" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Breeding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PregnancyTestLog" (
    "id" TEXT NOT NULL,
    "doeId" TEXT NOT NULL,
    "buckId" TEXT,
    "matingDate" TIMESTAMP(3) NOT NULL,
    "testDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PregnancyTestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KindlingLog" (
    "id" TEXT NOT NULL,
    "doeId" TEXT NOT NULL,
    "buckId" TEXT,
    "matingDate" TIMESTAMP(3),
    "kindlingDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KindlingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Breed" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Breed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Litter" (
    "id" TEXT NOT NULL,
    "breedingId" TEXT NOT NULL,
    "kindlingDate" TIMESTAMP(3) NOT NULL,
    "bornAlive" INTEGER NOT NULL DEFAULT 0,
    "bornDead" INTEGER NOT NULL DEFAULT 0,
    "weaned" INTEGER,
    "weaningDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Litter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightRecord" (
    "id" TEXT NOT NULL,
    "rabbitId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weightGrams" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthRecord" (
    "id" TEXT NOT NULL,
    "rabbitId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "nextDueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedLog" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "feedType" TEXT NOT NULL,
    "quantityG" INTEGER,
    "costCents" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "rabbitId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

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
CREATE INDEX "Rabbit_doeState_idx" ON "Rabbit"("doeState");

-- CreateIndex
CREATE UNIQUE INDEX "Rabbit_tagId_sex_key" ON "Rabbit"("tagId", "sex");

-- CreateIndex
CREATE INDEX "Breeding_outcome_idx" ON "Breeding"("outcome");

-- CreateIndex
CREATE INDEX "Breeding_expectedKindlingDate_idx" ON "Breeding"("expectedKindlingDate");

-- CreateIndex
CREATE INDEX "Breeding_doeId_idx" ON "Breeding"("doeId");

-- CreateIndex
CREATE INDEX "Breeding_buckId_idx" ON "Breeding"("buckId");

-- CreateIndex
CREATE INDEX "PregnancyTestLog_doeId_idx" ON "PregnancyTestLog"("doeId");

-- CreateIndex
CREATE INDEX "PregnancyTestLog_testDate_idx" ON "PregnancyTestLog"("testDate");

-- CreateIndex
CREATE INDEX "KindlingLog_doeId_idx" ON "KindlingLog"("doeId");

-- CreateIndex
CREATE INDEX "KindlingLog_kindlingDate_idx" ON "KindlingLog"("kindlingDate");

-- CreateIndex
CREATE UNIQUE INDEX "Breed_name_key" ON "Breed"("name");

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

-- AddForeignKey
ALTER TABLE "Rabbit" ADD CONSTRAINT "Rabbit_sireId_fkey" FOREIGN KEY ("sireId") REFERENCES "Rabbit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rabbit" ADD CONSTRAINT "Rabbit_damId_fkey" FOREIGN KEY ("damId") REFERENCES "Rabbit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rabbit" ADD CONSTRAINT "Rabbit_litterId_fkey" FOREIGN KEY ("litterId") REFERENCES "Litter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Breeding" ADD CONSTRAINT "Breeding_buckId_fkey" FOREIGN KEY ("buckId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Breeding" ADD CONSTRAINT "Breeding_doeId_fkey" FOREIGN KEY ("doeId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PregnancyTestLog" ADD CONSTRAINT "PregnancyTestLog_doeId_fkey" FOREIGN KEY ("doeId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PregnancyTestLog" ADD CONSTRAINT "PregnancyTestLog_buckId_fkey" FOREIGN KEY ("buckId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KindlingLog" ADD CONSTRAINT "KindlingLog_doeId_fkey" FOREIGN KEY ("doeId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KindlingLog" ADD CONSTRAINT "KindlingLog_buckId_fkey" FOREIGN KEY ("buckId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Litter" ADD CONSTRAINT "Litter_breedingId_fkey" FOREIGN KEY ("breedingId") REFERENCES "Breeding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightRecord" ADD CONSTRAINT "WeightRecord_rabbitId_fkey" FOREIGN KEY ("rabbitId") REFERENCES "Rabbit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthRecord" ADD CONSTRAINT "HealthRecord_rabbitId_fkey" FOREIGN KEY ("rabbitId") REFERENCES "Rabbit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_rabbitId_fkey" FOREIGN KEY ("rabbitId") REFERENCES "Rabbit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
