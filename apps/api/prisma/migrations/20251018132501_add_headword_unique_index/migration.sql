/*
  Warnings:

  - A unique constraint covering the columns `[headword]` on the table `Word` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Word_headword_key" ON "Word"("headword");
