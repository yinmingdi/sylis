-- Sylis has no production users yet. Replace the legacy word graph in one
-- transaction so every read path has exactly one canonical source of truth.
BEGIN;

TRUNCATE TABLE "Word" CASCADE;

DROP TABLE IF EXISTS "Synonym" CASCADE;
DROP TABLE IF EXISTS "Meaning" CASCADE;
DROP TABLE IF EXISTS "ExampleSentence" CASCADE;
DROP TABLE IF EXISTS "RealExamSentence" CASCADE;
DROP TABLE IF EXISTS "Phrase" CASCADE;
DROP TABLE IF EXISTS "WordRelation" CASCADE;
DROP TABLE IF EXISTS "WordLexiconMetadata" CASCADE;

ALTER TABLE "Word"
  DROP COLUMN IF EXISTS "ukPhonetic",
  DROP COLUMN IF EXISTS "usPhonetic",
  DROP COLUMN IF EXISTS "ukAudio",
  DROP COLUMN IF EXISTS "usAudio";

ALTER TABLE "Word"
  ADD COLUMN IF NOT EXISTS "normalizedHeadword" TEXT;
UPDATE "Word" SET "normalizedHeadword" = lower(trim("headword")) WHERE "normalizedHeadword" IS NULL;
ALTER TABLE "Word" ALTER COLUMN "normalizedHeadword" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Word_normalizedHeadword_key" ON "Word"("normalizedHeadword");
CREATE INDEX IF NOT EXISTS "Word_headword_idx" ON "Word"("headword");

ALTER TYPE "ContentSource" RENAME TO "ContentSource_legacy";
CREATE TYPE "ContentSource" AS ENUM ('ECDICT', 'YOUDAO', 'AI');
ALTER TABLE "Book" DROP COLUMN IF EXISTS "source";
ALTER TABLE "Book" ADD COLUMN "source" "ContentSource";
DROP TYPE "ContentSource_legacy";

CREATE TABLE "WordLexiconMetadata" (
  "id" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "source" "ContentSource" NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL,
  "bncRank" INTEGER,
  "frequencyRank" INTEGER,
  "oxford" BOOLEAN NOT NULL DEFAULT false,
  "collins" INTEGER,
  "exchange" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WordLexiconMetadata_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WordLexiconMetadata_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WordLexiconMetadata_wordId_source_sourceVersion_key" ON "WordLexiconMetadata"("wordId", "source", "sourceVersion");
CREATE INDEX "WordLexiconMetadata_source_idx" ON "WordLexiconMetadata"("source");
CREATE INDEX "WordLexiconMetadata_bncRank_idx" ON "WordLexiconMetadata"("bncRank");
CREATE INDEX "WordLexiconMetadata_frequencyRank_idx" ON "WordLexiconMetadata"("frequencyRank");

CREATE TYPE "ContentTrust" AS ENUM ('SOURCE_BACKED', 'AI_EXPERIMENTAL', 'HUMAN_VERIFIED', 'REJECTED');
CREATE TYPE "LexicalCategory" AS ENUM ('NOUN', 'VERB', 'ADJECTIVE', 'ADVERB', 'PRONOUN', 'PREPOSITION', 'CONJUNCTION', 'DETERMINER', 'ARTICLE', 'NUMERAL', 'INTERJECTION', 'AUXILIARY', 'PHRASE', 'PROPER_NOUN', 'ABBREVIATION', 'OTHER');
CREATE TYPE "LexicalFormType" AS ENUM ('CANONICAL', 'INFLECTED', 'VARIANT');
CREATE TYPE "PronunciationRegion" AS ENUM ('GENERAL', 'UK', 'US');
CREATE TYPE "ExampleKind" AS ENUM ('GENERAL', 'SOURCE_LABELED_EXAM', 'AI_SIMULATION');
CREATE TYPE "SemanticRelationType" AS ENUM ('SYNONYM', 'ANTONYM');
CREATE TYPE "LexemeRelationType" AS ENUM ('WORD_FAMILY', 'DERIVED_FROM', 'VARIANT', 'ABBREVIATION');
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'AUDIO');
CREATE TYPE "PracticeQuestionKind" AS ENUM ('MULTIPLE_CHOICE', 'AI_SIMULATION');

CREATE TABLE "LexiconSourceVersion" (
  "id" TEXT NOT NULL,
  "source" "ContentSource" NOT NULL,
  "version" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "artifactUri" TEXT,
  "status" TEXT NOT NULL,
  "imported" INTEGER NOT NULL DEFAULT 0,
  "rejected" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  CONSTRAINT "LexiconSourceVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LexiconSourceVersion_source_version_key" ON "LexiconSourceVersion"("source", "version");
CREATE INDEX "LexiconSourceVersion_source_status_idx" ON "LexiconSourceVersion"("source", "status");

CREATE TABLE "LexiconSourceActivation" (
  "source" "ContentSource" NOT NULL,
  "versionId" TEXT NOT NULL,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LexiconSourceActivation_pkey" PRIMARY KEY ("source"),
  CONSTRAINT "LexiconSourceActivation_versionId_key" UNIQUE ("versionId"),
  CONSTRAINT "LexiconSourceActivation_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LexiconSourceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "LexiconSourceRecord" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "sourceOrder" INTEGER NOT NULL DEFAULT 0,
  "rawPayloadHash" TEXT NOT NULL,
  "rawPayloadUri" TEXT,
  CONSTRAINT "LexiconSourceRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LexiconSourceRecord_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LexiconSourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LexiconSourceRecord_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LexiconSourceRecord_versionId_sourceKey_key" ON "LexiconSourceRecord"("versionId", "sourceKey");
CREATE INDEX "LexiconSourceRecord_wordId_versionId_idx" ON "LexiconSourceRecord"("wordId", "versionId");

CREATE TABLE "Lexeme" (
  "id" TEXT NOT NULL,
  "lemmaWordId" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'en',
  "lexicalCategory" "LexicalCategory" NOT NULL,
  "homographNo" INTEGER NOT NULL DEFAULT 1,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Lexeme_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Lexeme_lemmaWordId_fkey" FOREIGN KEY ("lemmaWordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Lexeme_lemmaWordId_lexicalCategory_homographNo_key" ON "Lexeme"("lemmaWordId", "lexicalCategory", "homographNo");
CREATE INDEX "Lexeme_lexicalCategory_idx" ON "Lexeme"("lexicalCategory");

CREATE TABLE "LexicalForm" (
  "id" TEXT NOT NULL,
  "lexemeId" TEXT NOT NULL,
  "indexedWordId" TEXT,
  "formType" "LexicalFormType" NOT NULL,
  "writtenForm" TEXT NOT NULL,
  "normalizedForm" TEXT NOT NULL,
  "featureKey" TEXT NOT NULL DEFAULT '',
  "sourceRecordId" TEXT,
  "source" "ContentSource" NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "trust" "ContentTrust" NOT NULL DEFAULT 'SOURCE_BACKED',
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "LexicalForm_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LexicalForm_lexemeId_fkey" FOREIGN KEY ("lexemeId") REFERENCES "Lexeme"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LexicalForm_indexedWordId_fkey" FOREIGN KEY ("indexedWordId") REFERENCES "Word"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "LexicalForm_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "LexiconSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LexicalForm_lexemeId_normalizedForm_featureKey_source_sourceVersion_key" ON "LexicalForm"("lexemeId", "normalizedForm", "featureKey", "source", "sourceVersion");
CREATE INDEX "LexicalForm_indexedWordId_idx" ON "LexicalForm"("indexedWordId");
CREATE INDEX "LexicalForm_normalizedForm_idx" ON "LexicalForm"("normalizedForm");

CREATE TABLE "FormPronunciation" (
  "id" TEXT NOT NULL,
  "lexicalFormId" TEXT NOT NULL,
  "region" "PronunciationRegion" NOT NULL,
  "ipa" TEXT,
  "audioUrl" TEXT,
  "sourceRecordId" TEXT,
  "source" "ContentSource" NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "trust" "ContentTrust" NOT NULL DEFAULT 'SOURCE_BACKED',
  CONSTRAINT "FormPronunciation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FormPronunciation_lexicalFormId_fkey" FOREIGN KEY ("lexicalFormId") REFERENCES "LexicalForm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FormPronunciation_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "LexiconSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FormPronunciation_lexicalFormId_region_source_sourceVersion_key" ON "FormPronunciation"("lexicalFormId", "region", "source", "sourceVersion");

CREATE TABLE "LexicalSense" (
  "id" TEXT NOT NULL,
  "lexemeId" TEXT NOT NULL,
  "sourceRecordId" TEXT,
  "sourceSenseKey" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "grammarLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "source" "ContentSource" NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "trust" "ContentTrust" NOT NULL DEFAULT 'SOURCE_BACKED',
  "confidence" DOUBLE PRECISION,
  CONSTRAINT "LexicalSense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LexicalSense_lexemeId_fkey" FOREIGN KEY ("lexemeId") REFERENCES "Lexeme"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LexicalSense_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "LexiconSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LexicalSense_sourceRecordId_sourceSenseKey_key" ON "LexicalSense"("sourceRecordId", "sourceSenseKey");
CREATE INDEX "LexicalSense_lexemeId_displayOrder_idx" ON "LexicalSense"("lexemeId", "displayOrder");

CREATE TABLE "SenseGloss" (
  "id" TEXT NOT NULL,
  "senseId" TEXT NOT NULL,
  "languageTag" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "normalized" TEXT NOT NULL,
  "sourceRecordId" TEXT,
  "source" "ContentSource" NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "trust" "ContentTrust" NOT NULL DEFAULT 'SOURCE_BACKED',
  "isExperimental" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "SenseGloss_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SenseGloss_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "LexicalSense"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SenseGloss_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "LexiconSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SenseGloss_senseId_languageTag_normalized_key" ON "SenseGloss"("senseId", "languageTag", "normalized");

CREATE TABLE "UsageExample" (
  "id" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "lexemeId" TEXT,
  "senseId" TEXT,
  "kind" "ExampleKind" NOT NULL,
  "sentenceEn" TEXT NOT NULL,
  "sentenceCn" TEXT,
  "sourceRecordId" TEXT,
  "source" "ContentSource" NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "trust" "ContentTrust" NOT NULL DEFAULT 'SOURCE_BACKED',
  "isExperimental" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "UsageExample_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UsageExample_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UsageExample_lexemeId_fkey" FOREIGN KEY ("lexemeId") REFERENCES "Lexeme"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "UsageExample_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "LexicalSense"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "UsageExample_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "LexiconSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UsageExample_wordId_sentenceEn_source_sourceVersion_key" ON "UsageExample"("wordId", "sentenceEn", "source", "sourceVersion");
CREATE INDEX "UsageExample_senseId_idx" ON "UsageExample"("senseId");

CREATE TABLE "ExampleCitation" (
  "id" TEXT NOT NULL,
  "exampleId" TEXT NOT NULL,
  "sourceRecordId" TEXT,
  "paper" TEXT,
  "level" TEXT,
  "year" TEXT,
  "examType" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ExampleCitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExampleCitation_exampleId_key" UNIQUE ("exampleId"),
  CONSTRAINT "ExampleCitation_exampleId_fkey" FOREIGN KEY ("exampleId") REFERENCES "UsageExample"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExampleCitation_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "LexiconSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ExampleCitation_level_year_idx" ON "ExampleCitation"("level", "year");

CREATE TABLE "Collocation" (
  "id" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "lexemeId" TEXT,
  "senseId" TEXT,
  "phraseText" TEXT NOT NULL,
  "phraseCn" TEXT,
  "sourceRecordId" TEXT,
  "source" "ContentSource" NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "trust" "ContentTrust" NOT NULL DEFAULT 'SOURCE_BACKED',
  "isExperimental" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Collocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Collocation_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Collocation_lexemeId_fkey" FOREIGN KEY ("lexemeId") REFERENCES "Lexeme"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Collocation_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "LexicalSense"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Collocation_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "LexiconSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Collocation_wordId_phraseText_source_sourceVersion_key" ON "Collocation"("wordId", "phraseText", "source", "sourceVersion");

CREATE TABLE "SemanticRelation" (
  "id" TEXT NOT NULL,
  "sourceLexemeId" TEXT NOT NULL,
  "sourceSenseId" TEXT,
  "targetLexemeId" TEXT,
  "targetSenseId" TEXT,
  "targetText" TEXT NOT NULL,
  "targetMeaning" TEXT,
  "relationType" "SemanticRelationType" NOT NULL,
  "sourceRecordId" TEXT,
  "source" "ContentSource" NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "trust" "ContentTrust" NOT NULL DEFAULT 'SOURCE_BACKED',
  "isExperimental" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "SemanticRelation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SemanticRelation_sourceLexemeId_fkey" FOREIGN KEY ("sourceLexemeId") REFERENCES "Lexeme"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SemanticRelation_sourceSenseId_fkey" FOREIGN KEY ("sourceSenseId") REFERENCES "LexicalSense"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SemanticRelation_targetLexemeId_fkey" FOREIGN KEY ("targetLexemeId") REFERENCES "Lexeme"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SemanticRelation_targetSenseId_fkey" FOREIGN KEY ("targetSenseId") REFERENCES "LexicalSense"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SemanticRelation_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "LexiconSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SemanticRelation_sourceLexemeId_sourceSenseId_relationType_targetText_source_sourceVersion_key" ON "SemanticRelation"("sourceLexemeId", "sourceSenseId", "relationType", "targetText", "source", "sourceVersion");
CREATE INDEX "SemanticRelation_targetLexemeId_idx" ON "SemanticRelation"("targetLexemeId");

CREATE TABLE "LexemeRelation" (
  "id" TEXT NOT NULL,
  "sourceLexemeId" TEXT NOT NULL,
  "targetLexemeId" TEXT,
  "targetText" TEXT NOT NULL,
  "targetMeaning" TEXT,
  "relationType" "LexemeRelationType" NOT NULL,
  "sourceRecordId" TEXT,
  "source" "ContentSource" NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "trust" "ContentTrust" NOT NULL DEFAULT 'SOURCE_BACKED',
  "isExperimental" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "LexemeRelation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LexemeRelation_sourceLexemeId_fkey" FOREIGN KEY ("sourceLexemeId") REFERENCES "Lexeme"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LexemeRelation_targetLexemeId_fkey" FOREIGN KEY ("targetLexemeId") REFERENCES "Lexeme"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "LexemeRelation_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "LexiconSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LexemeRelation_sourceLexemeId_relationType_targetText_source_sourceVersion_key" ON "LexemeRelation"("sourceLexemeId", "relationType", "targetText", "source", "sourceVersion");

CREATE TABLE "Mnemonic" (
  "id" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "lexemeId" TEXT,
  "senseId" TEXT,
  "text" TEXT NOT NULL,
  "sourceRecordId" TEXT,
  "source" "ContentSource" NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "trust" "ContentTrust" NOT NULL DEFAULT 'SOURCE_BACKED',
  "isExperimental" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Mnemonic_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Mnemonic_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Mnemonic_lexemeId_fkey" FOREIGN KEY ("lexemeId") REFERENCES "Lexeme"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Mnemonic_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "LexicalSense"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Mnemonic_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "LexiconSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Mnemonic_wordId_text_source_sourceVersion_key" ON "Mnemonic"("wordId", "text", "source", "sourceVersion");

CREATE TABLE "WordMedia" (
  "id" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "mediaType" "MediaType" NOT NULL,
  "uri" TEXT NOT NULL,
  "altText" TEXT,
  "sourceRecordId" TEXT,
  "source" "ContentSource" NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "trust" "ContentTrust" NOT NULL DEFAULT 'SOURCE_BACKED',
  CONSTRAINT "WordMedia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WordMedia_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WordMedia_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "LexiconSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WordMedia_wordId_mediaType_uri_source_sourceVersion_key" ON "WordMedia"("wordId", "mediaType", "uri", "source", "sourceVersion");

CREATE TABLE "WordPracticeQuestion" (
  "id" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "lexemeId" TEXT,
  "senseId" TEXT,
  "kind" "PracticeQuestionKind" NOT NULL,
  "stem" TEXT NOT NULL,
  "explanation" TEXT,
  "correctIndex" INTEGER,
  "sourceRecordId" TEXT,
  "source" "ContentSource" NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "trust" "ContentTrust" NOT NULL DEFAULT 'SOURCE_BACKED',
  "isExperimental" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "WordPracticeQuestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WordPracticeQuestion_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WordPracticeQuestion_lexemeId_fkey" FOREIGN KEY ("lexemeId") REFERENCES "Lexeme"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WordPracticeQuestion_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "LexicalSense"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WordPracticeQuestion_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "LexiconSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WordPracticeQuestion_wordId_stem_source_sourceVersion_key" ON "WordPracticeQuestion"("wordId", "stem", "source", "sourceVersion");

CREATE TABLE "WordPracticeChoice" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "choiceIndex" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  CONSTRAINT "WordPracticeChoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WordPracticeChoice_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "WordPracticeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WordPracticeChoice_questionId_choiceIndex_key" ON "WordPracticeChoice"("questionId", "choiceIndex");

CREATE TABLE "WordContentCompleteness" (
  "id" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "profile" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "missingFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "fieldStates" JSONB NOT NULL,
  "contentVersion" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WordContentCompleteness_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WordContentCompleteness_wordId_key" UNIQUE ("wordId"),
  CONSTRAINT "WordContentCompleteness_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

COMMIT;
