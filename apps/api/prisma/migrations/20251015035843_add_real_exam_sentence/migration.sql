-- CreateTable
CREATE TABLE "RealExamSentence" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "sentenceEn" TEXT NOT NULL,
    "sentenceCn" TEXT,
    "paper" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "examType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealExamSentence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RealExamSentence_level_year_idx" ON "RealExamSentence"("level", "year");

-- CreateIndex
CREATE INDEX "RealExamSentence_wordId_level_idx" ON "RealExamSentence"("wordId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "RealExamSentence_wordId_sentenceEn_year_level_key" ON "RealExamSentence"("wordId", "sentenceEn", "year", "level");

-- AddForeignKey
ALTER TABLE "RealExamSentence" ADD CONSTRAINT "RealExamSentence_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
