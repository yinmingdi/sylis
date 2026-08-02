CREATE TYPE "ContentSource" AS ENUM ('LEGACY', 'ECDICT', 'DERIVED', 'AI');
CREATE TYPE "BookCategory" AS ENUM ('EXAM', 'CORE', 'COLLINS', 'FREQUENCY');
CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

ALTER TABLE "DictionaryImportRun"
ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN "relations" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "books" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Book"
ADD COLUMN "source" "ContentSource",
ADD COLUMN "category" "BookCategory",
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "criteria" JSONB;

ALTER TABLE "Meaning" ADD COLUMN "source" "ContentSource" NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "Synonym" ADD COLUMN "source" "ContentSource" NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "ExampleSentence" ADD COLUMN "source" "ContentSource" NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "RealExamSentence" ADD COLUMN "source" "ContentSource" NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "Phrase" ADD COLUMN "source" "ContentSource" NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "WordRelation"
ADD COLUMN "relationType" TEXT,
ADD COLUMN "source" "ContentSource" NOT NULL DEFAULT 'LEGACY';

UPDATE "Meaning" AS meaning
SET "source" = 'ECDICT'
FROM "WordLexiconMetadata" AS metadata
WHERE metadata."wordId" = meaning."wordId" AND metadata."source" = 'ECDICT';

WITH duplicates AS (
  SELECT "id",
         row_number() OVER (
           PARTITION BY "bookId", "wordId"
           ORDER BY "wordRank" ASC, "id" ASC
         ) AS duplicate_rank
  FROM "WordBook"
)
DELETE FROM "WordBook"
WHERE "id" IN (
  SELECT "id" FROM duplicates WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX "WordBook_bookId_wordId_key" ON "WordBook"("bookId", "wordId");
CREATE INDEX "WordBook_bookId_wordRank_idx" ON "WordBook"("bookId", "wordRank");

DROP INDEX IF EXISTS "WordRelation_wordId_relatedWordId_pos_key";
CREATE UNIQUE INDEX "WordRelation_wordId_relatedWordId_relationType_key"
ON "WordRelation"("wordId", "relatedWordId", "relationType");

CREATE TABLE "WordEnrichment" (
  "id" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
  "contentVersion" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "costCny" DECIMAL(12,6) NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "lockedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WordEnrichment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VocabularyEnrichmentRun" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
  "model" TEXT NOT NULL,
  "contentVersion" TEXT NOT NULL,
  "requested" INTEGER NOT NULL DEFAULT 0,
  "processed" INTEGER NOT NULL DEFAULT 0,
  "succeeded" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "costCny" DECIMAL(12,6) NOT NULL DEFAULT 0,
  "projectedCostCny" DECIMAL(12,6),
  "costCapCny" DECIMAL(12,6),
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "VocabularyEnrichmentRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WordEnrichment_wordId_key" ON "WordEnrichment"("wordId");
CREATE INDEX "WordEnrichment_status_updatedAt_idx" ON "WordEnrichment"("status", "updatedAt");
CREATE INDEX "VocabularyEnrichmentRun_status_startedAt_idx" ON "VocabularyEnrichmentRun"("status", "startedAt");

ALTER TABLE "WordEnrichment"
ADD CONSTRAINT "WordEnrichment_wordId_fkey"
FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Word_headword_trgm_idx" ON "Word" USING GIN ("headword" gin_trgm_ops);

UPDATE "ChatConfig" SET "aiModel" = NULL WHERE "id" LIKE 'preset-%';
