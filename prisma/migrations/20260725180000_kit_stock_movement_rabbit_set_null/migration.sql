-- Deleting a سلالة used to CASCADE its "retained" KitStockMovement away, which
-- silently rewrote history: the deduction that happened on the day the kit was
-- kept for breeding simply vanished from the ledger.
--
-- The kit now comes *back*: the "retained" row stays exactly where it is, and
-- deleteRabbitOp books a separate positive "returned" row on the deletion day
-- (for purchased سلالات too, which never had a "retained" row to begin with).
-- That only works if the FK stops taking the old row down with the rabbit.
ALTER TABLE "KitStockMovement" DROP CONSTRAINT "KitStockMovement_rabbitId_fkey";

ALTER TABLE "KitStockMovement" ADD CONSTRAINT "KitStockMovement_rabbitId_fkey" FOREIGN KEY ("rabbitId") REFERENCES "Rabbit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
