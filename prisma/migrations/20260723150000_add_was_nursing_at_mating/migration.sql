-- Snapshot of the doe's base state (فاضية/مرضعة) at the moment each mating was
-- recorded. Added NOT NULL DEFAULT false so old app instances that haven't
-- picked up this migration keep inserting/updating rows fine (matches the
-- palpationCheckDays precedent).
ALTER TABLE "Breeding" ADD COLUMN "wasNursingAtMating" BOOLEAN NOT NULL DEFAULT false;

-- Best-guess backfill for existing rows: infer the pre-mating base state from
-- the doe's CURRENT doeState. Any "nursing*" state can only be reached by
-- mating a doe who was already nursing (see markMatedOp's nursing branch), so
-- those breedings are marked as having started from "مرضعة"; everything else
-- (empty/bred/pregnant/excluded) defaults to "فاضية" (the column's default).
UPDATE "Breeding" b
SET "wasNursingAtMating" = true
FROM "Rabbit" r
WHERE b."doeId" = r."id"
  AND r."doeState" IN ('nursing', 'nursing_bred', 'nursing_pregnant');
