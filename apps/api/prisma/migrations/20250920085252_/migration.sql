/*
  Warnings:

  - A unique constraint covering the columns `[wordId,sentenceEn]` on the table `ExampleSentence` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[wordId,partOfSpeech,meaningCn]` on the table `Meaning` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[wordId,phraseText]` on the table `Phrase` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[meaningId,synonymText]` on the table `Synonym` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[wordId,relatedWordId,pos]` on the table `WordRelation` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "LearningLog" ADD COLUMN     "plannedNewWordIds" JSONB,
ADD COLUMN     "plannedReviewWordIds" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "ExampleSentence_wordId_sentenceEn_key" ON "ExampleSentence"("wordId", "sentenceEn");

-- CreateIndex
CREATE UNIQUE INDEX "Meaning_wordId_partOfSpeech_meaningCn_key" ON "Meaning"("wordId", "partOfSpeech", "meaningCn");

-- CreateIndex
CREATE UNIQUE INDEX "Phrase_wordId_phraseText_key" ON "Phrase"("wordId", "phraseText");

-- CreateIndex
CREATE UNIQUE INDEX "Synonym_meaningId_synonymText_key" ON "Synonym"("meaningId", "synonymText");

-- CreateIndex
CREATE UNIQUE INDEX "WordRelation_wordId_relatedWordId_pos_key" ON "WordRelation"("wordId", "relatedWordId", "pos");
