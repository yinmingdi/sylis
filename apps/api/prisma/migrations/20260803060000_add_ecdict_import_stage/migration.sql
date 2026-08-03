ALTER TABLE "LexiconSourceRecord"
ADD COLUMN "projectionVersion" INTEGER NOT NULL DEFAULT 1;

CREATE UNLOGGED TABLE "EcdictImportStage" (
  "runId" TEXT NOT NULL,
  "sourceOrder" INTEGER NOT NULL,
  "headword" TEXT NOT NULL,
  "normalizedHeadword" TEXT NOT NULL,
  "star" INTEGER NOT NULL,
  "phonetic" TEXT,
  "rawPayloadHash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  CONSTRAINT "EcdictImportStage_pkey" PRIMARY KEY ("runId", "sourceOrder"),
  CONSTRAINT "EcdictImportStage_runId_fkey" FOREIGN KEY ("runId")
    REFERENCES "DictionaryImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EcdictImportStage_runId_normalizedHeadword_idx"
ON "EcdictImportStage"("runId", "normalizedHeadword");
