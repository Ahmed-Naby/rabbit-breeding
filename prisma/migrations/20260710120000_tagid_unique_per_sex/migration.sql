-- DropIndex
DROP INDEX "Rabbit_tagId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Rabbit_tagId_sex_key" ON "Rabbit"("tagId", "sex");
