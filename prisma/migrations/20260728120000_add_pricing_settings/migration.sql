-- AlterTable: the farm's money defaults. Until now nothing about price lived in
-- Settings — سعر الكيلو was re-typed by hand on every kit sale, and a feed bill
-- was a bare amount with no ton price or consumption behind it, so there was no
-- way to say what a kilo of meat or a ton of feed costs on THIS farm.
--
-- All three default to 0, meaning "not set". A plausible-looking default (say
-- 5500 piastres a kilo) would quietly pre-fill real sales with a price nobody
-- chose, so an empty field the farm fills in once is the safer zero value.
ALTER TABLE "Settings" ADD COLUMN "defaultPricePerKgCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Settings" ADD COLUMN "feedPricePerTonCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Settings" ADD COLUMN "feedGramsPerDoePerDay" INTEGER NOT NULL DEFAULT 0;
