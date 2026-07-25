-- Fostering decision aid thresholds (see Settings model comments).
ALTER TABLE "Settings" ADD COLUMN "fosterWindowDays" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Settings" ADD COLUMN "fosterHighKits" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "Settings" ADD COLUMN "fosterLowKits" INTEGER NOT NULL DEFAULT 4;
