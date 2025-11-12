-- CreateTable
CREATE TABLE "VocabularyTest" (
    "id" TEXT NOT NULL,
    "userLearningId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "estimatedVocabulary" INTEGER NOT NULL,
    "timeSpent" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VocabularyTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyTestAnswer" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "questionWord" TEXT NOT NULL,
    "options" TEXT[],
    "userAnswer" INTEGER NOT NULL,
    "correctAnswer" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "difficulty" TEXT NOT NULL,
    "timeSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabularyTestAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VocabularyTest_userLearningId_completedAt_idx" ON "VocabularyTest"("userLearningId", "completedAt" DESC);

-- CreateIndex
CREATE INDEX "VocabularyTest_userLearningId_isCompleted_idx" ON "VocabularyTest"("userLearningId", "isCompleted");

-- CreateIndex
CREATE INDEX "VocabularyTestAnswer_testId_idx" ON "VocabularyTestAnswer"("testId");

-- AddForeignKey
ALTER TABLE "VocabularyTest" ADD CONSTRAINT "VocabularyTest_userLearningId_fkey" FOREIGN KEY ("userLearningId") REFERENCES "UserLearning"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularyTestAnswer" ADD CONSTRAINT "VocabularyTestAnswer_testId_fkey" FOREIGN KEY ("testId") REFERENCES "VocabularyTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
