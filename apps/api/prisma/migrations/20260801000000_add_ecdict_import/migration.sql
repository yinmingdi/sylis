CREATE TABLE "DictionaryImportRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceCommit" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "selected" INTEGER NOT NULL DEFAULT 0,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "DictionaryImportRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WordLexiconMetadata" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceCommit" TEXT NOT NULL,
    "tags" TEXT[],
    "bncRank" INTEGER,
    "frequencyRank" INTEGER,
    "oxford" BOOLEAN NOT NULL DEFAULT false,
    "collins" INTEGER,
    "exchange" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WordLexiconMetadata_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DictionaryImportRun_source_startedAt_idx" ON "DictionaryImportRun"("source", "startedAt");
CREATE UNIQUE INDEX "WordLexiconMetadata_wordId_key" ON "WordLexiconMetadata"("wordId");
CREATE INDEX "WordLexiconMetadata_source_idx" ON "WordLexiconMetadata"("source");
CREATE INDEX "WordLexiconMetadata_bncRank_idx" ON "WordLexiconMetadata"("bncRank");
CREATE INDEX "WordLexiconMetadata_frequencyRank_idx" ON "WordLexiconMetadata"("frequencyRank");

ALTER TABLE "WordLexiconMetadata"
ADD CONSTRAINT "WordLexiconMetadata_wordId_fkey"
FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;
