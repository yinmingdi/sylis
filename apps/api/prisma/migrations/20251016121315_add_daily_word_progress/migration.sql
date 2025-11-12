-- CreateEnum
CREATE TYPE "FirstRoundChoice" AS ENUM ('NOT_STARTED', 'RECOGNIZED', 'NOT_RECOGNIZED');

-- CreateTable
CREATE TABLE "DailyWordProgress" (
    "id" TEXT NOT NULL,
    "userLearningId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "firstRoundChoice" "FirstRoundChoice" NOT NULL DEFAULT 'NOT_STARTED',
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "requiredCorrectCount" INTEGER NOT NULL DEFAULT 1,
    "isCompletedToday" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyWordProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyWordProgress_date_idx" ON "DailyWordProgress"("date");

-- CreateIndex
CREATE INDEX "DailyWordProgress_userLearningId_date_isCompletedToday_idx" ON "DailyWordProgress"("userLearningId", "date", "isCompletedToday");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWordProgress_userLearningId_wordId_date_key" ON "DailyWordProgress"("userLearningId", "wordId", "date");

-- AddForeignKey
ALTER TABLE "DailyWordProgress" ADD CONSTRAINT "DailyWordProgress_userLearningId_fkey" FOREIGN KEY ("userLearningId") REFERENCES "UserLearning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWordProgress" ADD CONSTRAINT "DailyWordProgress_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
