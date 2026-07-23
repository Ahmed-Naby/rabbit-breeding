-- CreateTable
CREATE TABLE "MatingLog" (
    "farmId" TEXT NOT NULL DEFAULT '',
    "id" TEXT NOT NULL,
    "doeId" TEXT NOT NULL,
    "buckId" TEXT,
    "matingDate" TIMESTAMP(3) NOT NULL,
    "wasNursingAtMating" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatingLog_doeId_idx" ON "MatingLog"("doeId");

-- CreateIndex
CREATE INDEX "MatingLog_matingDate_idx" ON "MatingLog"("matingDate");

-- CreateIndex
CREATE INDEX "MatingLog_farmId_idx" ON "MatingLog"("farmId");

-- AddForeignKey
ALTER TABLE "MatingLog" ADD CONSTRAINT "MatingLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatingLog" ADD CONSTRAINT "MatingLog_doeId_fkey" FOREIGN KEY ("doeId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatingLog" ADD CONSTRAINT "MatingLog_buckId_fkey" FOREIGN KEY ("buckId") REFERENCES "Rabbit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one row per historically-distinct (farmId, doeId, buckId, matingDate)
-- mating, recovered from every place that snapshot still survives today.
-- Priority 0 (current Breeding rows) wins over priority 1 (the permanent
-- logs) when both exist for the same mating, since Breeding still carries
-- the real wasNursingAtMating value computed by the prior migration; the
-- priority-1 sources default it to false since it's unknowable that far
-- back. Matings undone via clearDoeRowOp before reaching any log stage
-- (kindled/resorbed/failed/tested) leave no trace anywhere and are not
-- recoverable — an accepted, disclosed gap.
INSERT INTO "MatingLog" ("id", "farmId", "doeId", "buckId", "matingDate", "wasNursingAtMating", "createdAt")
SELECT
  'mlog_' || substr(md5(random()::text || clock_timestamp()::text || src."doeId" || src."matingDate"::text), 1, 20),
  src."farmId", src."doeId", src."buckId", src."matingDate", src."wasNursingAtMating", src."createdAt"
FROM (
  SELECT DISTINCT ON ("farmId", "doeId", "buckId", "matingDate")
    "farmId", "doeId", "buckId", "matingDate", "wasNursingAtMating", "createdAt"
  FROM (
    SELECT "farmId", "doeId", "buckId", "matingDate", "wasNursingAtMating", "createdAt", 0 AS priority
    FROM "Breeding"
    WHERE "matingDate" IS NOT NULL

    UNION ALL

    SELECT "farmId", "doeId", "buckId", "matingDate", false AS "wasNursingAtMating", "createdAt", 1 AS priority
    FROM "PregnancyTestLog"

    UNION ALL

    SELECT "farmId", "doeId", "buckId", "matingDate", false AS "wasNursingAtMating", "createdAt", 1 AS priority
    FROM "ResorptionLog"

    UNION ALL

    SELECT "farmId", "doeId", "buckId", "matingDate", false AS "wasNursingAtMating", "createdAt", 1 AS priority
    FROM "KindlingLog"
    WHERE "matingDate" IS NOT NULL
  ) all_sources
  ORDER BY "farmId", "doeId", "buckId", "matingDate", priority ASC
) src;

-- AlterTable
ALTER TABLE "Breeding" DROP COLUMN "wasNursingAtMating";
