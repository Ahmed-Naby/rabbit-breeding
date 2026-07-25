-- «عدد الخلفة»: the litter size at the kindling moment, frozen forever.
-- KindlingLog.bornAlive is a *nursing* count — fostering and kit deaths mirror
-- into it — so it can never answer "how many did she actually have".
ALTER TABLE "KindlingLog" ADD COLUMN "bornAliveAtKindling" INTEGER NOT NULL DEFAULT 0;

-- Best-effort backfill. The original birth counts are not recoverable: every
-- pre-existing row's bornAlive has already absorbed whatever transfers and
-- deaths happened since. This is the closest available value, and it is exact
-- for any litter that never lost or fostered a kit.
UPDATE "KindlingLog" SET "bornAliveAtKindling" = "bornAlive";
