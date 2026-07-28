-- Replaces the single feedGramsPerDoePerDay ration with one per animal class.
-- The old column shipped hours ago and no farm has filled it in, so it is
-- dropped rather than migrated into feedGramsDoeNursingPerDay: carrying a
-- "doe + her litter" number into a "doe only" field would look like data and
-- be wrong by the whole weight of a litter.
ALTER TABLE "Settings" DROP COLUMN "feedGramsPerDoePerDay";

ALTER TABLE "Settings" ADD COLUMN "feedGramsDoeIdlePerDay" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Settings" ADD COLUMN "feedGramsDoePregnantPerDay" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Settings" ADD COLUMN "feedGramsDoeNursingPerDay" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Settings" ADD COLUMN "feedGramsBuckPerDay" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Settings" ADD COLUMN "feedGramsGrowerPerDay" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Settings" ADD COLUMN "feedGramsJuvenilePerDay" INTEGER NOT NULL DEFAULT 0;
