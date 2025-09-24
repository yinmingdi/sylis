/*
  Warnings:

  - You are about to drop the column `userId` on the `UserWord` table. All the data in the column will be lost.
  - Added the required column `userLearningId` to the `UserWord` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "UserWord" DROP CONSTRAINT "UserWord_userId_fkey";

-- AlterTable
ALTER TABLE "UserWord" DROP COLUMN "userId",
ADD COLUMN     "userLearningId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "UserLearning" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLearning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBook" (
    "id" TEXT NOT NULL,
    "userLearningId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "dailyNewWords" INTEGER NOT NULL DEFAULT 0,
    "dailyReviewWords" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserLearning_userId_key" ON "UserLearning"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBook_userLearningId_bookId_key" ON "UserBook"("userLearningId", "bookId");

-- AddForeignKey
ALTER TABLE "UserLearning" ADD CONSTRAINT "UserLearning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWord" ADD CONSTRAINT "UserWord_userLearningId_fkey" FOREIGN KEY ("userLearningId") REFERENCES "UserLearning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBook" ADD CONSTRAINT "UserBook_userLearningId_fkey" FOREIGN KEY ("userLearningId") REFERENCES "UserLearning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBook" ADD CONSTRAINT "UserBook_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
