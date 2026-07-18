-- Multi-farm tenancy: auth tables (User/Farm/FarmMember/DeviceToken) and a
-- farmId on every farm-data table. All existing rows are backfilled into a
-- fixed default farm; the first account to register claims ownership of it
-- (see /api/auth/register). Columns are added nullable, backfilled, then
-- locked to NOT NULL — the raw prisma diff would fail on non-empty tables.

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Farm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Farm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmMember" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FarmMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "FarmMember_userId_idx" ON "FarmMember"("userId");
CREATE UNIQUE INDEX "FarmMember_farmId_userId_key" ON "FarmMember"("farmId", "userId");
CREATE UNIQUE INDEX "DeviceToken_tokenHash_key" ON "DeviceToken"("tokenHash");
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- AddForeignKey
ALTER TABLE "FarmMember" ADD CONSTRAINT "FarmMember_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FarmMember" ADD CONSTRAINT "FarmMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The default farm every pre-tenancy row belongs to.
INSERT INTO "Farm" ("id", "name") VALUES ('farm_default_000000000001', 'المزرعة الرئيسية');

-- Backfill farmId on every farm-data table: add nullable -> fill -> lock.
ALTER TABLE "Rabbit" ADD COLUMN "farmId" TEXT;
UPDATE "Rabbit" SET "farmId" = 'farm_default_000000000001';
ALTER TABLE "Rabbit" ALTER COLUMN "farmId" SET NOT NULL;

ALTER TABLE "Breeding" ADD COLUMN "farmId" TEXT;
UPDATE "Breeding" SET "farmId" = 'farm_default_000000000001';
ALTER TABLE "Breeding" ALTER COLUMN "farmId" SET NOT NULL;

ALTER TABLE "Litter" ADD COLUMN "farmId" TEXT;
UPDATE "Litter" SET "farmId" = 'farm_default_000000000001';
ALTER TABLE "Litter" ALTER COLUMN "farmId" SET NOT NULL;

ALTER TABLE "WeightRecord" ADD COLUMN "farmId" TEXT;
UPDATE "WeightRecord" SET "farmId" = 'farm_default_000000000001';
ALTER TABLE "WeightRecord" ALTER COLUMN "farmId" SET NOT NULL;

ALTER TABLE "HealthRecord" ADD COLUMN "farmId" TEXT;
UPDATE "HealthRecord" SET "farmId" = 'farm_default_000000000001';
ALTER TABLE "HealthRecord" ALTER COLUMN "farmId" SET NOT NULL;

ALTER TABLE "Transaction" ADD COLUMN "farmId" TEXT;
UPDATE "Transaction" SET "farmId" = 'farm_default_000000000001';
ALTER TABLE "Transaction" ALTER COLUMN "farmId" SET NOT NULL;

ALTER TABLE "KitStockMovement" ADD COLUMN "farmId" TEXT;
UPDATE "KitStockMovement" SET "farmId" = 'farm_default_000000000001';
ALTER TABLE "KitStockMovement" ALTER COLUMN "farmId" SET NOT NULL;

ALTER TABLE "Breed" ADD COLUMN "farmId" TEXT;
UPDATE "Breed" SET "farmId" = 'farm_default_000000000001';
ALTER TABLE "Breed" ALTER COLUMN "farmId" SET NOT NULL;

ALTER TABLE "PregnancyTestLog" ADD COLUMN "farmId" TEXT;
UPDATE "PregnancyTestLog" SET "farmId" = 'farm_default_000000000001';
ALTER TABLE "PregnancyTestLog" ALTER COLUMN "farmId" SET NOT NULL;

ALTER TABLE "KindlingLog" ADD COLUMN "farmId" TEXT;
UPDATE "KindlingLog" SET "farmId" = 'farm_default_000000000001';
ALTER TABLE "KindlingLog" ALTER COLUMN "farmId" SET NOT NULL;

ALTER TABLE "FosterLog" ADD COLUMN "farmId" TEXT;
UPDATE "FosterLog" SET "farmId" = 'farm_default_000000000001';
ALTER TABLE "FosterLog" ALTER COLUMN "farmId" SET NOT NULL;

-- Settings: one row per farm — farmId replaces the old fixed id=1 key.
ALTER TABLE "Settings" ADD COLUMN "farmId" TEXT;
UPDATE "Settings" SET "farmId" = 'farm_default_000000000001';
ALTER TABLE "Settings" ALTER COLUMN "farmId" SET NOT NULL;
ALTER TABLE "Settings" DROP CONSTRAINT "Settings_pkey";
ALTER TABLE "Settings" DROP COLUMN "id";
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_pkey" PRIMARY KEY ("farmId");

-- SyncDevice: bind to farm; userId stays null for legacy shared-secret devices.
ALTER TABLE "SyncDevice" ADD COLUMN "farmId" TEXT,
ADD COLUMN "userId" TEXT;
UPDATE "SyncDevice" SET "farmId" = 'farm_default_000000000001';
ALTER TABLE "SyncDevice" ALTER COLUMN "farmId" SET NOT NULL;

-- Uniques become per-farm.
DROP INDEX "Rabbit_tagId_sex_key";
CREATE UNIQUE INDEX "Rabbit_farmId_tagId_sex_key" ON "Rabbit"("farmId", "tagId", "sex");
DROP INDEX "Breed_name_key";
CREATE UNIQUE INDEX "Breed_farmId_name_key" ON "Breed"("farmId", "name");

-- Schema drift cleanup carried by the diff.
ALTER TABLE "WeightRecord" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- farmId indexes
CREATE INDEX "Rabbit_farmId_idx" ON "Rabbit"("farmId");
CREATE INDEX "Breeding_farmId_idx" ON "Breeding"("farmId");
CREATE INDEX "Litter_farmId_idx" ON "Litter"("farmId");
CREATE INDEX "WeightRecord_farmId_idx" ON "WeightRecord"("farmId");
CREATE INDEX "HealthRecord_farmId_idx" ON "HealthRecord"("farmId");
CREATE INDEX "Transaction_farmId_idx" ON "Transaction"("farmId");
CREATE INDEX "KitStockMovement_farmId_idx" ON "KitStockMovement"("farmId");
CREATE INDEX "Breed_farmId_idx" ON "Breed"("farmId");
CREATE INDEX "PregnancyTestLog_farmId_idx" ON "PregnancyTestLog"("farmId");
CREATE INDEX "KindlingLog_farmId_idx" ON "KindlingLog"("farmId");
CREATE INDEX "FosterLog_farmId_idx" ON "FosterLog"("farmId");
CREATE INDEX "SyncDevice_farmId_idx" ON "SyncDevice"("farmId");

-- Tenant FKs
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Rabbit" ADD CONSTRAINT "Rabbit_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Breeding" ADD CONSTRAINT "Breeding_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Litter" ADD CONSTRAINT "Litter_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeightRecord" ADD CONSTRAINT "WeightRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthRecord" ADD CONSTRAINT "HealthRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KitStockMovement" ADD CONSTRAINT "KitStockMovement_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Breed" ADD CONSTRAINT "Breed_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PregnancyTestLog" ADD CONSTRAINT "PregnancyTestLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KindlingLog" ADD CONSTRAINT "KindlingLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FosterLog" ADD CONSTRAINT "FosterLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyncDevice" ADD CONSTRAINT "SyncDevice_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyncDevice" ADD CONSTRAINT "SyncDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
