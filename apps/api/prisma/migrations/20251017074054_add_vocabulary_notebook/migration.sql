-- CreateEnum
CREATE TYPE "CollectionSource" AS ENUM ('MANUAL', 'READING', 'QUIZ', 'AI_CHAT', 'LISTENING', 'WRITING');

-- CreateTable
CREATE TABLE "VocabularyNotebook" (
    "id" TEXT NOT NULL,
    "userLearningId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '我的生词本',
    "description" TEXT,
    "coverColor" TEXT DEFAULT '#1677ff',
    "icon" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabularyNotebook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectedWord" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "source" "CollectionSource" DEFAULT 'MANUAL',
    "context" TEXT,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isMarkedAsLearned" BOOLEAN NOT NULL DEFAULT false,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastReviewedAt" TIMESTAMP(3),

    CONSTRAINT "CollectedWord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VocabularyNotebook_userLearningId_isDefault_idx" ON "VocabularyNotebook"("userLearningId", "isDefault");

-- CreateIndex
CREATE INDEX "VocabularyNotebook_userLearningId_sortOrder_idx" ON "VocabularyNotebook"("userLearningId", "sortOrder");

-- CreateIndex
CREATE INDEX "CollectedWord_notebookId_addedAt_idx" ON "CollectedWord"("notebookId", "addedAt" DESC);

-- CreateIndex
CREATE INDEX "CollectedWord_notebookId_isMarkedAsLearned_idx" ON "CollectedWord"("notebookId", "isMarkedAsLearned");

-- CreateIndex
CREATE INDEX "CollectedWord_source_idx" ON "CollectedWord"("source");

-- CreateIndex
CREATE UNIQUE INDEX "CollectedWord_notebookId_wordId_key" ON "CollectedWord"("notebookId", "wordId");

-- AddForeignKey
ALTER TABLE "VocabularyNotebook" ADD CONSTRAINT "VocabularyNotebook_userLearningId_fkey" FOREIGN KEY ("userLearningId") REFERENCES "UserLearning"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectedWord" ADD CONSTRAINT "CollectedWord_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "VocabularyNotebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectedWord" ADD CONSTRAINT "CollectedWord_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;
