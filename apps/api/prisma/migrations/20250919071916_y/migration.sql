/*
  Warnings:

  - You are about to drop the column `relationType` on the `WordRelation` table. All the data in the column will be lost.
  - Added the required column `pos` to the `WordRelation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WordRelation" DROP COLUMN "relationType",
ADD COLUMN     "pos" TEXT NOT NULL;

-- DropEnum
DROP TYPE "WordRelationType";
