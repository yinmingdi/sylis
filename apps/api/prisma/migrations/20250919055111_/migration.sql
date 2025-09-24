/*
  Warnings:

  - The `relationType` column on the `WordRelation` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `Choice` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Question` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "QuizQuestionType" AS ENUM ('CHOICE');

-- CreateEnum
CREATE TYPE "WordRelationType" AS ENUM ('SYNONYM', 'ANTONYM', 'SIMILAR', 'RELATED', 'DERIVED', 'COMPOUND');

-- DropForeignKey
ALTER TABLE "Choice" DROP CONSTRAINT "Choice_questionId_fkey";

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_wordId_fkey";

-- AlterTable
ALTER TABLE "WordRelation" DROP COLUMN "relationType",
ADD COLUMN     "relationType" "WordRelationType";

-- DropTable
DROP TABLE "Choice";

-- DropTable
DROP TABLE "Question";

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "type" "QuizQuestionType" NOT NULL,
    "wordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizChoiceQuestion" (
    "id" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "answerWordId" TEXT NOT NULL,

    CONSTRAINT "QuizChoiceQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizChoiceOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizChoiceOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuizChoiceQuestion_baseId_key" ON "QuizChoiceQuestion"("baseId");

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizChoiceQuestion" ADD CONSTRAINT "QuizChoiceQuestion_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "QuizQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizChoiceOption" ADD CONSTRAINT "QuizChoiceOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizChoiceQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizChoiceOption" ADD CONSTRAINT "QuizChoiceOption_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
