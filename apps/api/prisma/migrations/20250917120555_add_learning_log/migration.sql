/*
  Warnings:

  - The `status` column on the `UserWord` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `LearningPath` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserLearningPath` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userLearningId,wordId]` on the table `UserWord` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "WordLearningStatus" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'MASTERED', 'SUSPENDED');

-- DropForeignKey
ALTER TABLE "UserLearningPath" DROP CONSTRAINT "UserLearningPath_learningPathId_fkey";

-- DropForeignKey
ALTER TABLE "UserLearningPath" DROP CONSTRAINT "UserLearningPath_userId_fkey";

-- AlterTable
ALTER TABLE "UserWord" ADD COLUMN     "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
ADD COLUMN     "interval" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nextReviewAt" TIMESTAMP(3),
ADD COLUMN     "repetition" INTEGER NOT NULL DEFAULT 0,
DROP COLUMN "status",
ADD COLUMN     "status" "WordLearningStatus" NOT NULL DEFAULT 'NEW';

-- DropTable
DROP TABLE "LearningPath";

-- DropTable
DROP TABLE "UserLearningPath";

-- CreateTable
CREATE TABLE "LearningLog" (
    "id" TEXT NOT NULL,
    "userLearningId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "plannedNewCount" INTEGER NOT NULL,
    "plannedReviewCount" INTEGER NOT NULL,
    "completedNewCount" INTEGER NOT NULL DEFAULT 0,
    "completedReviewCount" INTEGER NOT NULL DEFAULT 0,
    "totalTimeSeconds" INTEGER,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearningLog_date_idx" ON "LearningLog"("date");

-- CreateIndex
CREATE UNIQUE INDEX "LearningLog_userLearningId_date_key" ON "LearningLog"("userLearningId", "date");

-- CreateIndex
CREATE INDEX "UserWord_nextReviewAt_idx" ON "UserWord"("nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserWord_userLearningId_wordId_key" ON "UserWord"("userLearningId", "wordId");

-- AddForeignKey
ALTER TABLE "LearningLog" ADD CONSTRAINT "LearningLog_userLearningId_fkey" FOREIGN KEY ("userLearningId") REFERENCES "UserLearning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
