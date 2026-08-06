-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LexiconReleaseStatus" AS ENUM ('DRAFT', 'VALIDATING', 'VALIDATED', 'RETIRED');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ProvenanceKind" AS ENUM ('SOURCE', 'DERIVED', 'GENERATED', 'HUMAN');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('TUTOR_RESPONSE', 'READING_GENERATION', 'GRAMMAR_DIAGNOSIS', 'DATA_EXPORT', 'DAILY_PLAN', 'SOURCE_SYNC', 'LEXICON_BUILD', 'LEXICON_IMPORT', 'LEXICON_VALIDATE');

-- CreateEnum
CREATE TYPE "JobExecutor" AS ENUM ('WORKER', 'COMPILER_RUNNER', 'IMPORTER_RUNNER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'RETRY_SCHEDULED', 'PAUSED', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SessionAudience" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('PENDING', 'VERIFIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "OperatorRole" AS ENUM ('SUPPORT', 'CONTENT_REVIEWER', 'RELEASE_MANAGER', 'SECURITY_ADMIN');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('PRESENTED', 'SUBMITTED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ExerciseResponseKind" AS ENUM ('CHOICE', 'SHORT_TEXT', 'EXTENDED_TEXT', 'NO_CAPTURE');

-- CreateEnum
CREATE TYPE "ExerciseValidationLevel" AS ENUM ('PRACTICE_ONLY', 'FORMATIVE_VERIFIED', 'SUMMATIVE_VERIFIED');

-- CreateEnum
CREATE TYPE "ReadingDocumentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "ReadingGeneration" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "requestedDifficulty" TEXT NOT NULL,
    "constraints" JSONB NOT NULL,
    "resultRevisionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelInvocation" (
    "id" UUID NOT NULL,
    "jobId" UUID,
    "capability" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "requestedModel" TEXT NOT NULL,
    "resolvedModel" TEXT,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "outputHash" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costMicros" BIGINT,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ModelInvocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsageLedger" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "capability" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "units" BIGINT NOT NULL,
    "costMicros" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIQuotaPolicy" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "window" TEXT NOT NULL,
    "limitUnits" BIGINT NOT NULL,
    "limitMicros" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "effectiveTo" TIMESTAMPTZ(3),
    "version" TEXT NOT NULL,

    CONSTRAINT "AIQuotaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeFeatureControl" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" UUID NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RuntimeFeatureControl_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "TutorSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TutorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorMessage" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "currentRevisionId" UUID,
    "jobId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorMessageRevision" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "contentCiphertext" BYTEA NOT NULL,
    "keyVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorMessageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorContextRef" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "releaseId" UUID,

    CONSTRAINT "TutorContextRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrammarDiagnosis" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "inputCiphertext" BYTEA NOT NULL,
    "outputCiphertext" BYTEA,
    "keyVersion" TEXT NOT NULL,
    "languageTag" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrammarDiagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentBlueprint" (
    "id" UUID NOT NULL,
    "lexiconId" UUID NOT NULL,
    "blueprintKey" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,

    CONSTRAINT "AssessmentBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentBlueprintRevision" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "blueprintId" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "navigationMode" TEXT NOT NULL,
    "feedbackMode" TEXT NOT NULL,
    "lookbackDays" INTEGER NOT NULL,
    "selectionAlgorithm" TEXT NOT NULL,
    "timeLimitSeconds" INTEGER,
    "status" "RevisionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "contentHash" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "AssessmentBlueprintRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSection" (
    "id" UUID NOT NULL,
    "blueprintRevisionId" UUID NOT NULL,
    "parentSectionId" UUID,
    "position" INTEGER NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,

    CONSTRAINT "AssessmentSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSelectionRule" (
    "id" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "ruleKind" TEXT NOT NULL,
    "dimension" TEXT,
    "value" TEXT,
    "minCount" INTEGER,
    "maxCount" INTEGER,
    "targetKind" TEXT,
    "targetId" UUID,
    "scopeKind" TEXT,
    "scopeId" UUID,
    "exerciseRevisionId" UUID,

    CONSTRAINT "AssessmentSelectionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "blueprintRevisionId" UUID NOT NULL,
    "selectionSeed" TEXT NOT NULL,
    "selectionAlgorithmVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AssessmentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSessionItem" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "assessmentSectionId" UUID NOT NULL,
    "exerciseRevisionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "maxScore" DECIMAL(8,3) NOT NULL,

    CONSTRAINT "AssessmentSessionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentResult" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "rawScore" DECIMAL(10,3) NOT NULL,
    "maxScore" DECIMAL(10,3) NOT NULL,
    "domainScore" JSONB NOT NULL,
    "computedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAuditEvent" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "sessionId" UUID,
    "eventType" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" UUID,
    "actionDigest" TEXT,
    "outcome" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "metadata" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataAccessAuditEvent" (
    "id" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" UUID NOT NULL,
    "keyVersion" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataAccessAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyBook" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "languageTag" TEXT NOT NULL,
    "publisherKey" TEXT NOT NULL,

    CONSTRAINT "VocabularyBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyBookEdition" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "editionKey" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sourceDatasetVersionId" UUID NOT NULL,
    "contentHash" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VocabularyBookEdition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexiconReleaseBookEdition" (
    "releaseId" UUID NOT NULL,
    "editionId" UUID NOT NULL,

    CONSTRAINT "LexiconReleaseBookEdition_pkey" PRIMARY KEY ("releaseId","editionId")
);

-- CreateTable
CREATE TABLE "VocabularyBookItem" (
    "id" UUID NOT NULL,
    "editionId" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "evidenceId" UUID,

    CONSTRAINT "VocabularyBookItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentProfile" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,

    CONSTRAINT "ContentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentProfileVersion" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "requirementsHash" TEXT NOT NULL,

    CONSTRAINT "ContentProfileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentProfileEvaluation" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "profileVersionId" UUID NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "ContentProfileEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentProfileEvaluationTarget" (
    "evaluationId" UUID NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" UUID NOT NULL,

    CONSTRAINT "ContentProfileEvaluationTarget_pkey" PRIMARY KEY ("evaluationId","targetKind","targetId")
);

-- CreateTable
CREATE TABLE "ContentRequirementEvaluation" (
    "id" UUID NOT NULL,
    "evaluationId" UUID NOT NULL,
    "requirementCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reasonCode" TEXT,
    "evidenceCount" INTEGER NOT NULL,
    "detailsHash" TEXT,

    CONSTRAINT "ContentRequirementEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseQualityStatistic" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" BIGINT NOT NULL,

    CONSTRAINT "ReleaseQualityStatistic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorpusDataset" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "languageTag" TEXT NOT NULL,

    CONSTRAINT "CorpusDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorpusDatasetVersion" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "tokenCount" BIGINT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "CorpusDatasetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attestation" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "datasetVersionId" UUID NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "documentRef" TEXT NOT NULL,
    "offset" INTEGER NOT NULL,
    "offsetUnit" TEXT NOT NULL,
    "surfaceText" TEXT NOT NULL,
    "sourceRecordId" UUID NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "Attestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollocationObservation" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "datasetVersionId" UUID NOT NULL,
    "collocationId" UUID NOT NULL,
    "measureCode" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "window" INTEGER NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "CollocationObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrequencyObservation" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "datasetVersionId" UUID NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "count" BIGINT,
    "normalizedFrequency" DECIMAL(20,10),
    "rank" INTEGER,
    "unit" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "FrequencyObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentStimulus" (
    "id" UUID NOT NULL,
    "lexiconId" UUID NOT NULL,
    "identityKey" TEXT NOT NULL,

    CONSTRAINT "AssessmentStimulus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentStimulusRevision" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "stimulusId" UUID NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "contentHash" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "AssessmentStimulusRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentStimulusBlock" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "stimulusRevisionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "blockKind" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "languageTag" TEXT,
    "text" TEXT,
    "exampleId" UUID,
    "mediaAssetId" UUID,
    "materialRevisionId" UUID,

    CONSTRAINT "AssessmentStimulusBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseItem" (
    "id" UUID NOT NULL,
    "lexiconId" UUID NOT NULL,
    "identityKey" TEXT NOT NULL,
    "learningObjectiveId" UUID NOT NULL,

    CONSTRAINT "ExerciseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseRevision" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "exerciseItemId" UUID NOT NULL,
    "learningObjectiveRevisionId" UUID NOT NULL,
    "exerciseTaskKind" TEXT NOT NULL,
    "evidenceKind" TEXT NOT NULL,
    "responseKind" "ExerciseResponseKind" NOT NULL,
    "responseCardinality" TEXT NOT NULL,
    "responsePlacement" TEXT NOT NULL,
    "gradingMode" TEXT NOT NULL,
    "validationLevel" "ExerciseValidationLevel" NOT NULL,
    "promptLanguageTag" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "instructions" TEXT,
    "shuffleChoices" BOOLEAN NOT NULL,
    "maxScore" DECIMAL(8,3) NOT NULL,
    "authoredDifficultyTier" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "generatorVersion" TEXT NOT NULL,
    "verifierVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'PUBLISHED',

    CONSTRAINT "ExerciseRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseStimulusRef" (
    "exerciseRevisionId" UUID NOT NULL,
    "stimulusRevisionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "roleCode" TEXT NOT NULL,

    CONSTRAINT "ExerciseStimulusRef_pkey" PRIMARY KEY ("exerciseRevisionId","stimulusRevisionId","position")
);

-- CreateTable
CREATE TABLE "ExerciseResponseConfig" (
    "exerciseRevisionId" UUID NOT NULL,
    "responseKind" "ExerciseResponseKind" NOT NULL,
    "minSelections" INTEGER,
    "maxSelections" INTEGER,
    "caseSensitive" BOOLEAN,
    "diacriticPolicy" TEXT,
    "whitespacePolicy" TEXT,
    "capturePolicy" TEXT,
    "expectedLanguageTag" TEXT,
    "minCharacters" INTEGER,
    "maxCharacters" INTEGER,
    "minWords" INTEGER,
    "maxWords" INTEGER,
    "revealStimulusRevisionId" UUID,

    CONSTRAINT "ExerciseResponseConfig_pkey" PRIMARY KEY ("exerciseRevisionId")
);

-- CreateTable
CREATE TABLE "ExerciseChoice" (
    "id" UUID NOT NULL,
    "exerciseRevisionId" UUID NOT NULL,
    "choiceKey" TEXT NOT NULL,
    "languageTag" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "distractorKind" TEXT,

    CONSTRAINT "ExerciseChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseChoiceTarget" (
    "choiceId" UUID NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" UUID NOT NULL,

    CONSTRAINT "ExerciseChoiceTarget_pkey" PRIMARY KEY ("choiceId","targetKind","targetId")
);

-- CreateTable
CREATE TABLE "ExerciseCorrectChoice" (
    "exerciseRevisionId" UUID NOT NULL,
    "choiceId" UUID NOT NULL,
    "weight" DECIMAL(8,3) NOT NULL,

    CONSTRAINT "ExerciseCorrectChoice_pkey" PRIMARY KEY ("exerciseRevisionId","choiceId")
);

-- CreateTable
CREATE TABLE "ExerciseAcceptedText" (
    "id" UUID NOT NULL,
    "exerciseRevisionId" UUID NOT NULL,
    "languageTag" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "weight" DECIMAL(8,3) NOT NULL DEFAULT 1,

    CONSTRAINT "ExerciseAcceptedText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseFeedback" (
    "id" UUID NOT NULL,
    "exerciseRevisionId" UUID NOT NULL,
    "outcome" TEXT NOT NULL,
    "choiceId" UUID,
    "languageTag" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,

    CONSTRAINT "ExerciseFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseRubricCriterion" (
    "id" UUID NOT NULL,
    "exerciseRevisionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "criterionKey" TEXT NOT NULL,
    "languageTag" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "maxScore" DECIMAL(8,3) NOT NULL,

    CONSTRAINT "ExerciseRubricCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "exerciseRevisionId" UUID NOT NULL,
    "dailyStudyPlanItemId" UUID,
    "assessmentSessionItemId" UUID,
    "contextKind" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'PRESENTED',
    "score" DECIMAL(8,3),
    "maxScore" DECIMAL(8,3) NOT NULL,
    "correct" BOOLEAN,
    "idempotencyKey" TEXT NOT NULL,
    "presentedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ExerciseAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptPresentedChoice" (
    "attemptId" UUID NOT NULL,
    "choiceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "AttemptPresentedChoice_pkey" PRIMARY KEY ("attemptId","choiceId")
);

-- CreateTable
CREATE TABLE "AttemptSelectedChoice" (
    "attemptId" UUID NOT NULL,
    "choiceId" UUID NOT NULL,

    CONSTRAINT "AttemptSelectedChoice_pkey" PRIMARY KEY ("attemptId","choiceId")
);

-- CreateTable
CREATE TABLE "AttemptTextResponse" (
    "attemptId" UUID NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "keyVersion" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "consentRecordId" UUID NOT NULL,
    "normalizedHash" TEXT NOT NULL,

    CONSTRAINT "AttemptTextResponse_pkey" PRIMARY KEY ("attemptId")
);

-- CreateTable
CREATE TABLE "AttemptSelfReport" (
    "attemptId" UUID NOT NULL,
    "reportedCorrect" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttemptSelfReport_pkey" PRIMARY KEY ("attemptId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "credentialGeneration" INTEGER NOT NULL DEFAULT 0,
    "roleGeneration" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEmail" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "displayEmail" TEXT NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordCredential" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'argon2id',
    "status" "CredentialStatus" NOT NULL DEFAULT 'VERIFIED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaCredential" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'PENDING',
    "label" TEXT NOT NULL,
    "secretCiphertext" BYTEA,
    "keyVersion" TEXT,
    "credentialId" BYTEA,
    "publicKey" BYTEA,
    "signCount" BIGINT,
    "webAuthnUserId" BYTEA,
    "transports" TEXT[],
    "aaguid" TEXT,
    "deviceType" TEXT,
    "backedUp" BOOLEAN,
    "verifiedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "audience" "SessionAudience" NOT NULL,
    "purpose" TEXT NOT NULL,
    "challengeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "audience" "SessionAudience" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfSecretHash" TEXT NOT NULL,
    "authStrength" TEXT NOT NULL,
    "reauthenticatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "credentialGeneration" INTEGER NOT NULL,
    "roleGeneration" INTEGER NOT NULL,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" TEXT,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorRoleAssignment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "OperatorRole" NOT NULL,
    "grantedById" UUID NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" TEXT,

    CONSTRAINT "OperatorRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" UUID NOT NULL,
    "kind" "JobKind" NOT NULL,
    "executor" "JobExecutor" NOT NULL,
    "requestedByUserId" UUID,
    "subjectUserId" UUID,
    "audience" "SessionAudience" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "requestRefId" UUID NOT NULL,
    "inputHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "heartbeatAt" TIMESTAMPTZ(3),
    "cancelRequestedAt" TIMESTAMPTZ(3),
    "pauseReasonCode" TEXT,
    "errorCode" TEXT,
    "supersedesJobId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobProgressEvent" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "processed" BIGINT NOT NULL,
    "total" BIGINT,
    "ratePerSecond" DOUBLE PRECISION,
    "etaSeconds" INTEGER,
    "warningCode" TEXT,
    "message" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobProgressEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCheckpoint" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "handlerVersion" TEXT NOT NULL,
    "checkpointSchemaVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "stateCiphertext" BYTEA NOT NULL,
    "stateHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildRun" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "manifestUri" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "compileProfile" TEXT NOT NULL,
    "modelPolicy" JSONB NOT NULL,
    "budgetMicros" BIGINT NOT NULL,
    "artifactUri" TEXT,
    "artifactHash" TEXT,
    "compilerRunId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuildRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "artifactUri" TEXT NOT NULL,
    "artifactHash" TEXT NOT NULL,
    "expectedSchema" TEXT NOT NULL,
    "releaseId" UUID,
    "importedCounts" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactStagingRecord" (
    "id" BIGSERIAL NOT NULL,
    "jobId" UUID NOT NULL,
    "collectionPath" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtifactStagingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexiconValidationRequest" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "validationProfile" TEXT NOT NULL,
    "summary" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LexiconValidationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataExportRequest" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "scope" JSONB NOT NULL,
    "artifactUri" TEXT,
    "expiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "DataExportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSynchronization" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "cursor" TEXT,
    "summary" JSONB,

    CONSTRAINT "SourceSynchronization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "mediaType" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "contentUri" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "byteLength" BIGINT NOT NULL,
    "durationMs" INTEGER,
    "rightsPolicyId" UUID NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormMedia" (
    "releaseId" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "roleCode" TEXT NOT NULL,
    "regionTag" TEXT,
    "displayOrder" INTEGER NOT NULL,

    CONSTRAINT "FormMedia_pkey" PRIMARY KEY ("releaseId","formId","mediaAssetId","roleCode")
);

-- CreateTable
CREATE TABLE "EntryRelation" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "sourceEntryId" UUID NOT NULL,
    "targetEntryId" UUID NOT NULL,
    "typeCode" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "EntryRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SenseRelation" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "sourceSenseId" UUID NOT NULL,
    "targetSenseId" UUID NOT NULL,
    "typeCode" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "SenseRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptRelation" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "sourceConceptId" UUID NOT NULL,
    "targetConceptId" UUID NOT NULL,
    "typeCode" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "ConceptRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExampleSentence" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "languageTag" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedHash" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "ExampleSentence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExampleTranslation" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "exampleId" UUID NOT NULL,
    "languageTag" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "ExampleTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SenseExample" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "senseId" UUID NOT NULL,
    "exampleId" UUID NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "roleCode" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "SenseExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExampleCitation" (
    "id" UUID NOT NULL,
    "exampleId" UUID NOT NULL,
    "sourceRecordId" UUID NOT NULL,
    "workTitle" TEXT,
    "location" TEXT,
    "year" INTEGER,
    "examType" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExampleCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collocation" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "languageTag" TEXT NOT NULL,
    "canonicalText" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "headEntryId" UUID,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "Collocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SenseCollocation" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "senseId" UUID NOT NULL,
    "collocationId" UUID NOT NULL,
    "relationType" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "SenseCollocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollocationComponent" (
    "id" UUID NOT NULL,
    "collocationId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "surfaceText" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "entryId" UUID,
    "morphemeId" UUID,

    CONSTRAINT "CollocationComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lexicon" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "sourceLanguageTag" TEXT NOT NULL,
    "activeReleaseId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Lexicon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TextProcessingProfile" (
    "id" UUID NOT NULL,
    "unicodeVersion" TEXT NOT NULL,
    "cldrVersion" TEXT NOT NULL,
    "icuVersion" TEXT NOT NULL,
    "ucaVersion" TEXT NOT NULL,
    "normalizationForm" TEXT NOT NULL,
    "segmentationAlgorithm" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "collation" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TextProcessingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyBundle" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabularyBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyNamespaceVersion" (
    "id" UUID NOT NULL,
    "bundleId" UUID NOT NULL,
    "namespaceUri" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sourceUri" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,

    CONSTRAINT "VocabularyNamespaceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyTerm" (
    "id" UUID NOT NULL,
    "namespaceVersionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "deprecated" BOOLEAN NOT NULL DEFAULT false,
    "replacedById" UUID,

    CONSTRAINT "VocabularyTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexiconRelease" (
    "id" UUID NOT NULL,
    "lexiconId" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "status" "LexiconReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "textProfileId" UUID NOT NULL,
    "vocabularyBundleId" UUID NOT NULL,
    "compressedArtifactHash" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "canonicalizerVersion" TEXT NOT NULL,
    "validationSummary" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "LexiconRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexiconReleaseBuildMetadata" (
    "releaseId" UUID NOT NULL,
    "artifactSchemaVersion" TEXT NOT NULL,
    "compilerVersion" TEXT NOT NULL,
    "compilerGitCommit" TEXT NOT NULL,
    "compileProfile" TEXT NOT NULL,
    "validatorVersion" TEXT NOT NULL,
    "sourceManifestVersion" TEXT NOT NULL,
    "sourceManifestHash" TEXT NOT NULL,
    "headwordSetVersion" TEXT,
    "headwordSetHash" TEXT,
    "richTargetSetVersion" TEXT,
    "richTargetSetHash" TEXT,
    "aiEnabled" BOOLEAN NOT NULL,
    "aiPromptVersion" TEXT,
    "aiSchemaVersion" TEXT,
    "aiPolicyVersion" TEXT,
    "requestedProvider" TEXT,
    "requestedModel" TEXT,
    "resolvedProvider" TEXT,
    "resolvedModel" TEXT,

    CONSTRAINT "LexiconReleaseBuildMetadata_pkey" PRIMARY KEY ("releaseId")
);

-- CreateTable
CREATE TABLE "LexiconReleaseLearningLanguage" (
    "releaseId" UUID NOT NULL,
    "languageTag" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,

    CONSTRAINT "LexiconReleaseLearningLanguage_pkey" PRIMARY KEY ("releaseId","languageTag")
);

-- CreateTable
CREATE TABLE "Headword" (
    "id" UUID NOT NULL,
    "lexiconId" UUID NOT NULL,
    "identityKey" TEXT NOT NULL,
    "artifactRole" TEXT NOT NULL DEFAULT 'CURRENT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMPTZ(3),

    CONSTRAINT "Headword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeadwordRevision" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "headwordId" UUID NOT NULL,
    "displayText" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "searchKey" TEXT NOT NULL,
    "sortKey" TEXT NOT NULL,

    CONSTRAINT "HeadwordRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexicalEntry" (
    "id" UUID NOT NULL,
    "lexiconId" UUID NOT NULL,
    "identityKey" TEXT NOT NULL,
    "artifactRole" TEXT NOT NULL DEFAULT 'CURRENT',

    CONSTRAINT "LexicalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexicalEntryRevision" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "headwordId" UUID NOT NULL,
    "entryType" TEXT NOT NULL,
    "partOfSpeechCode" TEXT NOT NULL,
    "homographNo" INTEGER,
    "displayOrder" INTEGER NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "LexicalEntryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexicalForm" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "formType" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "LexicalForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormRepresentation" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "representationType" TEXT NOT NULL,
    "languageTag" TEXT NOT NULL,
    "regionTag" TEXT,
    "scriptTag" TEXT,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "FormRepresentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormFeature" (
    "releaseId" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "featureCode" TEXT NOT NULL,
    "valueCode" TEXT NOT NULL,

    CONSTRAINT "FormFeature_pkey" PRIMARY KEY ("releaseId","formId","featureCode")
);

-- CreateTable
CREATE TABLE "LexicalSense" (
    "id" UUID NOT NULL,
    "lexiconId" UUID NOT NULL,
    "identityKey" TEXT NOT NULL,
    "artifactRole" TEXT NOT NULL DEFAULT 'CURRENT',

    CONSTRAINT "LexicalSense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexicalSenseRevision" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "senseId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "parentSenseId" UUID,
    "displayOrder" INTEGER NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "LexicalSenseRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SenseDefinition" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "senseId" UUID NOT NULL,
    "languageTag" TEXT NOT NULL,
    "definitionType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "SenseDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SenseTranslationText" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "senseId" UUID NOT NULL,
    "languageTag" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "registerCode" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "SenseTranslationText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SenseUsage" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "senseId" UUID NOT NULL,
    "usageTypeCode" TEXT NOT NULL,
    "valueCode" TEXT,
    "text" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "SenseUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexicalConcept" (
    "id" UUID NOT NULL,
    "lexiconId" UUID NOT NULL,
    "identityKey" TEXT NOT NULL,
    "artifactRole" TEXT NOT NULL DEFAULT 'CURRENT',

    CONSTRAINT "LexicalConcept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexicalConceptRevision" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "conceptId" UUID NOT NULL,
    "conceptType" TEXT NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "LexicalConceptRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SenseConceptMembership" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "senseId" UUID NOT NULL,
    "conceptId" UUID NOT NULL,
    "membershipType" TEXT NOT NULL,
    "canonical" BOOLEAN NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "SenseConceptMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptDefinition" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "conceptId" UUID NOT NULL,
    "languageTag" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "ConceptDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Etymon" (
    "id" UUID NOT NULL,
    "lexiconId" UUID NOT NULL,
    "identityKey" TEXT NOT NULL,
    "artifactRole" TEXT NOT NULL DEFAULT 'CURRENT',

    CONSTRAINT "Etymon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtymonRevision" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "etymonId" UUID NOT NULL,
    "languageTag" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "gloss" TEXT,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "EtymonRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtymologyHypothesis" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "subjectEntryId" UUID NOT NULL,
    "hypothesisType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "EtymologyHypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtymologyLink" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "hypothesisId" UUID NOT NULL,
    "linkType" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "EtymologyLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Morph" (
    "id" UUID NOT NULL,
    "lexiconId" UUID NOT NULL,
    "identityKey" TEXT NOT NULL,
    "artifactRole" TEXT NOT NULL DEFAULT 'CURRENT',
    "morphemeId" UUID,

    CONSTRAINT "Morph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Morpheme" (
    "id" UUID NOT NULL,
    "lexiconId" UUID NOT NULL,
    "identityKey" TEXT NOT NULL,
    "artifactRole" TEXT NOT NULL DEFAULT 'CURRENT',

    CONSTRAINT "Morpheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MorphologicalAnalysis" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "formRepresentationId" UUID NOT NULL,
    "analysisType" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "MorphologicalAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MorphologicalSegment" (
    "analysisId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "surfaceText" TEXT NOT NULL,
    "morphId" UUID,
    "morphemeId" UUID,
    "roleCode" TEXT NOT NULL,

    CONSTRAINT "MorphologicalSegment_pkey" PRIMARY KEY ("analysisId","position")
);

-- CreateTable
CREATE TABLE "InflectionRule" (
    "id" UUID NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "inputPattern" TEXT NOT NULL,
    "outputPattern" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "InflectionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InflectionGeneration" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "baseFormId" UUID NOT NULL,
    "outputFormId" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "InflectionGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordFormation" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "targetEntryId" UUID NOT NULL,
    "formationTypeCode" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "WordFormation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordFormationInput" (
    "formationId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "inputEntryId" UUID,
    "morphemeId" UUID,
    "roleCode" TEXT NOT NULL,

    CONSTRAINT "WordFormationInput_pkey" PRIMARY KEY ("formationId","position")
);

-- CreateTable
CREATE TABLE "WordFormationRule" (
    "id" UUID NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "inputPattern" TEXT NOT NULL,
    "outputPattern" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "WordFormationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordFormationApplication" (
    "formationId" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "stepOrder" INTEGER NOT NULL,

    CONSTRAINT "WordFormationApplication_pkey" PRIMARY KEY ("formationId","stepOrder")
);

-- CreateTable
CREATE TABLE "TranslationRelation" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "sourceSenseId" UUID NOT NULL,
    "targetSenseId" UUID NOT NULL,
    "translationType" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "TranslationRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexicalLineage" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "entityKind" TEXT NOT NULL,
    "fromId" UUID NOT NULL,
    "toId" UUID NOT NULL,
    "lineageType" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "LexicalLineage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexicalExternalIdentifier" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "ownerKind" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "namespaceVersionId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "uri" TEXT,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "LexicalExternalIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyntacticFrame" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "frameKey" TEXT NOT NULL,
    "frameTypeCode" TEXT NOT NULL,
    "languageTag" TEXT NOT NULL,
    "displayTemplate" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "SyntacticFrame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyntacticArgument" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "frameId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "functionCode" TEXT NOT NULL,
    "phraseTypeCode" TEXT NOT NULL,
    "marker" TEXT,
    "optional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SyntacticArgument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SemanticPredicate" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "senseId" UUID NOT NULL,
    "predicateKey" TEXT NOT NULL,
    "predicateTypeCode" TEXT NOT NULL,
    "label" TEXT,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "SemanticPredicate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SemanticArgument" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "predicateId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "roleCode" TEXT NOT NULL,

    CONSTRAINT "SemanticArgument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SenseFrame" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "senseId" UUID NOT NULL,
    "frameId" UUID NOT NULL,
    "predicateId" UUID,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "SenseFrame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArgumentMapping" (
    "senseFrameId" UUID NOT NULL,
    "syntacticArgumentId" UUID NOT NULL,
    "semanticArgumentId" UUID NOT NULL,

    CONSTRAINT "ArgumentMapping_pkey" PRIMARY KEY ("senseFrameId","syntacticArgumentId","semanticArgumentId")
);

-- CreateTable
CREATE TABLE "Notebook" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Notebook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectedLexicalItem" (
    "id" UUID NOT NULL,
    "notebookId" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "noteCiphertext" BYTEA,
    "keyVersion" TEXT,
    "position" INTEGER NOT NULL,
    "tags" JSONB NOT NULL,
    "collectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CollectedLexicalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" UUID NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionDigest" TEXT NOT NULL,
    "requiredRole" "OperatorRole" NOT NULL,
    "requesterId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reauthenticatedAt" TIMESTAMPTZ(3) NOT NULL,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexiconReleaseActivation" (
    "id" UUID NOT NULL,
    "lexiconId" UUID NOT NULL,
    "fromReleaseId" UUID,
    "toReleaseId" UUID NOT NULL,
    "approvalId" UUID,
    "actorUserId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LexiconReleaseActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentRelease" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "gitSha" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "imageDigests" JSONB NOT NULL,
    "buildProof" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "deployedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewBatch" (
    "id" UUID NOT NULL,
    "riskPolicy" TEXT NOT NULL,
    "candidateSetHash" TEXT NOT NULL,
    "samplePlan" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "failureRate" DECIMAL(8,5),
    "notes" TEXT,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventVersion" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),
    "publishAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastErrorCode" TEXT,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseRef" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRightsPolicy" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "mayBuild" BOOLEAN NOT NULL,
    "mayServe" BOOLEAN NOT NULL,
    "mayExport" BOOLEAN NOT NULL,
    "requiresAttribution" BOOLEAN NOT NULL,
    "attribution" TEXT,
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "effectiveTo" TIMESTAMPTZ(3),

    CONSTRAINT "SourceRightsPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDataset" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "homepageUri" TEXT NOT NULL,

    CONSTRAINT "SourceDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDatasetVersion" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "sourceUri" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "rightsPolicyId" UUID NOT NULL,

    CONSTRAINT "SourceDatasetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRecord" (
    "id" UUID NOT NULL,
    "datasetVersionId" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "languageTag" TEXT NOT NULL,
    "rawPayloadHash" TEXT NOT NULL,
    "rawPayloadUri" TEXT,
    "rawPayload" JSONB NOT NULL,

    CONSTRAINT "SourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRestriction" (
    "id" UUID NOT NULL,
    "rightsPolicyId" UUID NOT NULL,
    "datasetVersionId" UUID,
    "restrictionKind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SourceRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexiconReleaseSourceInput" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "sourceDatasetVersionId" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,

    CONSTRAINT "LexiconReleaseSourceInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provenance" (
    "id" UUID NOT NULL,
    "kind" "ProvenanceKind" NOT NULL,
    "contentHash" TEXT NOT NULL,
    "resolverVersion" TEXT NOT NULL,
    "decisionReason" TEXT NOT NULL,

    CONSTRAINT "Provenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentEvidence" (
    "id" UUID NOT NULL,
    "provenanceId" UUID NOT NULL,
    "evidenceKind" TEXT NOT NULL,
    "sourceRecordId" UUID,
    "upstreamProvenanceId" UUID,
    "note" TEXT,

    CONSTRAINT "ContentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactProjectionRecord" (
    "releaseId" UUID NOT NULL,
    "collectionPath" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "entityId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "ArtifactProjectionRecord_pkey" PRIMARY KEY ("releaseId","collectionPath","position")
);

-- CreateTable
CREATE TABLE "ReadingDocument" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID,
    "sourceKind" TEXT NOT NULL,
    "externalKey" TEXT,
    "currentRevisionId" UUID,
    "status" "ReadingDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingDocumentRevision" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "languageTag" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentCiphertext" BYTEA NOT NULL,
    "keyVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "withdrawnAt" TIMESTAMPTZ(3),

    CONSTRAINT "ReadingDocumentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexicalAnnotation" (
    "id" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "selectedTextHash" TEXT NOT NULL,
    "releaseId" UUID NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "LexicalAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingActivity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "progress" DOUBLE PRECISION NOT NULL,
    "lastOffset" INTEGER NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ReadingActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingActivityEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "revisionId" UUID,
    "eventKind" TEXT NOT NULL,
    "offset" INTEGER,
    "progress" DOUBLE PRECISION,
    "targetKind" TEXT,
    "targetId" UUID,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedReading" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "documentId" UUID,
    "releaseId" UUID,
    "targetKind" TEXT,
    "targetId" UUID,
    "savedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedditDocumentMetadata" (
    "documentId" UUID NOT NULL,
    "subreddit" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorHash" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourceCreatedAt" TIMESTAMPTZ(3) NOT NULL,
    "sourceEditedAt" TIMESTAMPTZ(3),
    "withdrawnAt" TIMESTAMPTZ(3),
    "retentionUntil" TIMESTAMPTZ(3),

    CONSTRAINT "RedditDocumentMetadata_pkey" PRIMARY KEY ("documentId")
);

-- CreateTable
CREATE TABLE "RedditSourceObservation" (
    "id" UUID NOT NULL,
    "synchronizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "postId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "contentHash" TEXT,
    "sourceEditedAt" TIMESTAMPTZ(3),
    "observedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedditSourceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProficiencyFramework" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceDatasetId" UUID NOT NULL,

    CONSTRAINT "ProficiencyFramework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProficiencyFrameworkVersion" (
    "id" UUID NOT NULL,
    "frameworkId" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "sourceDatasetVersionId" UUID NOT NULL,

    CONSTRAINT "ProficiencyFrameworkVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProficiencyLevel" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "ProficiencyLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProficiencyClaim" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "levelId" UUID NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "claimType" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "ProficiencyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningObjective" (
    "id" UUID NOT NULL,
    "lexiconId" UUID NOT NULL,
    "identityKey" TEXT NOT NULL,

    CONSTRAINT "LearningObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningObjectiveRevision" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "objectiveId" UUID NOT NULL,
    "knowledgeFacet" TEXT NOT NULL,
    "retrievalDirection" TEXT NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "contentHash" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "LearningObjectiveRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningObjectiveSubject" (
    "objectiveRevisionId" UUID NOT NULL,
    "subjectRole" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" UUID NOT NULL,

    CONSTRAINT "LearningObjectiveSubject_pkey" PRIMARY KEY ("objectiveRevisionId","subjectRole","targetKind","targetId")
);

-- CreateTable
CREATE TABLE "LearningObjectiveHint" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "objectiveRevisionId" UUID NOT NULL,
    "hintKind" TEXT NOT NULL,
    "languageTag" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "LearningObjectiveHint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedagogicalMaterial" (
    "id" UUID NOT NULL,
    "lexiconId" UUID NOT NULL,
    "identityKey" TEXT NOT NULL,

    CONSTRAINT "PedagogicalMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedagogicalMaterialRevision" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "materialId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "learningLanguageTag" TEXT NOT NULL,
    "supportLanguageTag" TEXT NOT NULL,
    "audienceProfileKey" TEXT NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "contentHash" TEXT NOT NULL,
    "provenanceId" UUID NOT NULL,

    CONSTRAINT "PedagogicalMaterialRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedagogicalMaterialTarget" (
    "materialRevisionId" UUID NOT NULL,
    "targetRole" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" UUID NOT NULL,

    CONSTRAINT "PedagogicalMaterialTarget_pkey" PRIMARY KEY ("materialRevisionId","targetRole","targetKind","targetId")
);

-- CreateTable
CREATE TABLE "PedagogicalMaterialBlock" (
    "id" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "materialRevisionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "blockKind" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "languageTag" TEXT,
    "text" TEXT,
    "exampleId" UUID,
    "mediaAssetId" UUID,

    CONSTRAINT "PedagogicalMaterialBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedagogicalMaterialMention" (
    "id" UUID NOT NULL,
    "materialBlockId" UUID NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" UUID NOT NULL,

    CONSTRAINT "PedagogicalMaterialMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedagogicalMaterialCitation" (
    "id" UUID NOT NULL,
    "materialBlockId" UUID NOT NULL,
    "contentEvidenceId" UUID NOT NULL,

    CONSTRAINT "PedagogicalMaterialCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBookEnrollment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "editionId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "dailyNewLimit" INTEGER NOT NULL DEFAULT 20,
    "enrolledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "UserBookEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStudyPlan" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "enrollmentId" UUID,
    "releaseId" UUID NOT NULL,
    "localDate" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyStudyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStudyPlanItem" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "objectiveRevisionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DailyStudyPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FSRSParameterSet" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FSRSParameterSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserObjectiveMemoryState" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "objectiveId" UUID NOT NULL,
    "objectiveRevisionId" UUID NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "fsrsState" INTEGER NOT NULL DEFAULT 0,
    "stability" DOUBLE PRECISION NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "elapsedDays" INTEGER NOT NULL DEFAULT 0,
    "scheduledDays" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "lapseCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserObjectiveMemoryState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "objectiveRevisionId" UUID NOT NULL,
    "parameterSetId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMPTZ(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "ReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewStateSnapshot" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "phase" TEXT NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "fsrsState" INTEGER NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "elapsedDays" INTEGER NOT NULL,
    "scheduledDays" INTEGER NOT NULL,

    CONSTRAINT "ReviewStateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReadingGeneration_jobId_key" ON "ReadingGeneration"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelInvocation_idempotencyKey_key" ON "ModelInvocation"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AIUsageLedger_idempotencyKey_key" ON "AIUsageLedger"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AIQuotaPolicy_scope_capability_version_key" ON "AIQuotaPolicy"("scope", "capability", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TutorMessage_currentRevisionId_key" ON "TutorMessage"("currentRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "TutorMessage_jobId_key" ON "TutorMessage"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "TutorMessageRevision_messageId_revisionNo_key" ON "TutorMessageRevision"("messageId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "TutorContextRef_messageId_targetKind_targetId_key" ON "TutorContextRef"("messageId", "targetKind", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "GrammarDiagnosis_jobId_key" ON "GrammarDiagnosis"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentBlueprint_lexiconId_blueprintKey_key" ON "AssessmentBlueprint"("lexiconId", "blueprintKey");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentBlueprintRevision_releaseId_blueprintId_key" ON "AssessmentBlueprintRevision"("releaseId", "blueprintId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentSection_blueprintRevisionId_parentSectionId_posit_key" ON "AssessmentSection"("blueprintRevisionId", "parentSectionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentSelectionRule_sectionId_position_key" ON "AssessmentSelectionRule"("sectionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentSession_userId_idempotencyKey_key" ON "AssessmentSession"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentSessionItem_sessionId_position_key" ON "AssessmentSessionItem"("sessionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentSessionItem_sessionId_exerciseRevisionId_key" ON "AssessmentSessionItem"("sessionId", "exerciseRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentResult_sessionId_key" ON "AssessmentResult"("sessionId");

-- CreateIndex
CREATE INDEX "SecurityAuditEvent_actorUserId_occurredAt_idx" ON "SecurityAuditEvent"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "SecurityAuditEvent_subjectType_subjectId_occurredAt_idx" ON "SecurityAuditEvent"("subjectType", "subjectId", "occurredAt");

-- CreateIndex
CREATE INDEX "DataAccessAuditEvent_ownerUserId_occurredAt_idx" ON "DataAccessAuditEvent"("ownerUserId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyBook_key_key" ON "VocabularyBook"("key");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyBookEdition_bookId_editionKey_key" ON "VocabularyBookEdition"("bookId", "editionKey");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyBookEdition_bookId_version_key" ON "VocabularyBookEdition"("bookId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyBookEdition_bookId_contentHash_key" ON "VocabularyBookEdition"("bookId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyBookItem_editionId_position_key" ON "VocabularyBookItem"("editionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyBookItem_editionId_targetKind_targetId_key" ON "VocabularyBookItem"("editionId", "targetKind", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentProfile_key_targetKind_key" ON "ContentProfile"("key", "targetKind");

-- CreateIndex
CREATE UNIQUE INDEX "ContentProfileVersion_profileId_version_key" ON "ContentProfileVersion"("profileId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ContentProfileEvaluation_releaseId_id_key" ON "ContentProfileEvaluation"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ContentRequirementEvaluation_evaluationId_requirementCode_key" ON "ContentRequirementEvaluation"("evaluationId", "requirementCode");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseQualityStatistic_releaseId_category_key_key" ON "ReleaseQualityStatistic"("releaseId", "category", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CorpusDataset_key_key" ON "CorpusDataset"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CorpusDatasetVersion_datasetId_version_key" ON "CorpusDatasetVersion"("datasetId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Attestation_releaseId_datasetVersionId_documentRef_offset_t_key" ON "Attestation"("releaseId", "datasetVersionId", "documentRef", "offset", "targetKind", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "CollocationObservation_releaseId_datasetVersionId_collocati_key" ON "CollocationObservation"("releaseId", "datasetVersionId", "collocationId", "measureCode", "algorithmVersion");

-- CreateIndex
CREATE UNIQUE INDEX "FrequencyObservation_releaseId_datasetVersionId_targetKind__key" ON "FrequencyObservation"("releaseId", "datasetVersionId", "targetKind", "targetId", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentStimulus_lexiconId_identityKey_key" ON "AssessmentStimulus"("lexiconId", "identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentStimulusRevision_releaseId_stimulusId_key" ON "AssessmentStimulusRevision"("releaseId", "stimulusId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentStimulusRevision_releaseId_id_key" ON "AssessmentStimulusRevision"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentStimulusBlock_releaseId_stimulusRevisionId_positi_key" ON "AssessmentStimulusBlock"("releaseId", "stimulusRevisionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseItem_lexiconId_identityKey_key" ON "ExerciseItem"("lexiconId", "identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseRevision_releaseId_exerciseItemId_key" ON "ExerciseRevision"("releaseId", "exerciseItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseRevision_releaseId_id_key" ON "ExerciseRevision"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseChoice_exerciseRevisionId_choiceKey_key" ON "ExerciseChoice"("exerciseRevisionId", "choiceKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseChoice_exerciseRevisionId_normalizedText_key" ON "ExerciseChoice"("exerciseRevisionId", "normalizedText");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseCorrectChoice_choiceId_key" ON "ExerciseCorrectChoice"("choiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseAcceptedText_exerciseRevisionId_languageTag_normali_key" ON "ExerciseAcceptedText"("exerciseRevisionId", "languageTag", "normalizedText");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseFeedback_exerciseRevisionId_outcome_choiceId_langua_key" ON "ExerciseFeedback"("exerciseRevisionId", "outcome", "choiceId", "languageTag");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseRubricCriterion_exerciseRevisionId_position_key" ON "ExerciseRubricCriterion"("exerciseRevisionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseAttempt_userId_idempotencyKey_key" ON "ExerciseAttempt"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseAttempt_userId_exerciseRevisionId_contextKind_attem_key" ON "ExerciseAttempt"("userId", "exerciseRevisionId", "contextKind", "attemptNo");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptPresentedChoice_attemptId_position_key" ON "AttemptPresentedChoice"("attemptId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "UserEmail_normalizedEmail_key" ON "UserEmail"("normalizedEmail");

-- CreateIndex
CREATE INDEX "UserEmail_userId_idx" ON "UserEmail"("userId");

-- CreateIndex
CREATE INDEX "PasswordCredential_userId_status_idx" ON "PasswordCredential"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MfaCredential_credentialId_key" ON "MfaCredential"("credentialId");

-- CreateIndex
CREATE INDEX "MfaCredential_userId_status_idx" ON "MfaCredential"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AuthChallenge_challengeHash_key" ON "AuthChallenge"("challengeHash");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_purpose_decidedAt_idx" ON "ConsentRecord"("userId", "purpose", "decidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_audience_expiresAt_idx" ON "AuthSession"("userId", "audience", "expiresAt");

-- CreateIndex
CREATE INDEX "OperatorRoleAssignment_userId_role_revokedAt_idx" ON "OperatorRoleAssignment"("userId", "role", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJob_leaseToken_key" ON "BackgroundJob"("leaseToken");

-- CreateIndex
CREATE INDEX "BackgroundJob_executor_kind_status_nextAttemptAt_priority_idx" ON "BackgroundJob"("executor", "kind", "status", "nextAttemptAt", "priority");

-- CreateIndex
CREATE INDEX "BackgroundJob_leaseExpiresAt_idx" ON "BackgroundJob"("leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJob_requestedByUserId_kind_idempotencyKey_key" ON "BackgroundJob"("requestedByUserId", "kind", "idempotencyKey");

-- CreateIndex
CREATE INDEX "JobProgressEvent_jobId_occurredAt_idx" ON "JobProgressEvent"("jobId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobProgressEvent_jobId_sequence_key" ON "JobProgressEvent"("jobId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "JobCheckpoint_jobId_sequence_key" ON "JobCheckpoint"("jobId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "BuildRun_jobId_key" ON "BuildRun"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_jobId_key" ON "ImportJob"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_artifactHash_key" ON "ImportJob"("artifactHash");

-- CreateIndex
CREATE INDEX "ArtifactStagingRecord_jobId_collectionPath_id_idx" ON "ArtifactStagingRecord"("jobId", "collectionPath", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ArtifactStagingRecord_jobId_collectionPath_position_key" ON "ArtifactStagingRecord"("jobId", "collectionPath", "position");

-- CreateIndex
CREATE UNIQUE INDEX "LexiconValidationRequest_jobId_key" ON "LexiconValidationRequest"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "DataExportRequest_jobId_key" ON "DataExportRequest"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSynchronization_jobId_key" ON "SourceSynchronization"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_releaseId_id_key" ON "MediaAsset"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_releaseId_contentHash_key" ON "MediaAsset"("releaseId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "EntryRelation_releaseId_sourceEntryId_targetEntryId_typeCod_key" ON "EntryRelation"("releaseId", "sourceEntryId", "targetEntryId", "typeCode");

-- CreateIndex
CREATE UNIQUE INDEX "SenseRelation_releaseId_sourceSenseId_targetSenseId_typeCod_key" ON "SenseRelation"("releaseId", "sourceSenseId", "targetSenseId", "typeCode");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptRelation_releaseId_sourceConceptId_targetConceptId_t_key" ON "ConceptRelation"("releaseId", "sourceConceptId", "targetConceptId", "typeCode");

-- CreateIndex
CREATE UNIQUE INDEX "ExampleSentence_releaseId_id_key" ON "ExampleSentence"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExampleSentence_releaseId_languageTag_normalizedHash_key" ON "ExampleSentence"("releaseId", "languageTag", "normalizedHash");

-- CreateIndex
CREATE UNIQUE INDEX "ExampleTranslation_releaseId_exampleId_languageTag_text_key" ON "ExampleTranslation"("releaseId", "exampleId", "languageTag", "text");

-- CreateIndex
CREATE UNIQUE INDEX "SenseExample_releaseId_senseId_exampleId_roleCode_key" ON "SenseExample"("releaseId", "senseId", "exampleId", "roleCode");

-- CreateIndex
CREATE UNIQUE INDEX "Collocation_releaseId_id_key" ON "Collocation"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Collocation_releaseId_languageTag_normalizedText_key" ON "Collocation"("releaseId", "languageTag", "normalizedText");

-- CreateIndex
CREATE UNIQUE INDEX "SenseCollocation_releaseId_senseId_collocationId_relationTy_key" ON "SenseCollocation"("releaseId", "senseId", "collocationId", "relationType");

-- CreateIndex
CREATE UNIQUE INDEX "CollocationComponent_collocationId_position_key" ON "CollocationComponent"("collocationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Lexicon_key_key" ON "Lexicon"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Lexicon_activeReleaseId_key" ON "Lexicon"("activeReleaseId");

-- CreateIndex
CREATE UNIQUE INDEX "TextProcessingProfile_contentHash_key" ON "TextProcessingProfile"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyBundle_contentHash_key" ON "VocabularyBundle"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyNamespaceVersion_bundleId_namespaceUri_key" ON "VocabularyNamespaceVersion"("bundleId", "namespaceUri");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyTerm_namespaceVersionId_code_key" ON "VocabularyTerm"("namespaceVersionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyTerm_namespaceVersionId_uri_key" ON "VocabularyTerm"("namespaceVersionId", "uri");

-- CreateIndex
CREATE UNIQUE INDEX "LexiconRelease_compressedArtifactHash_key" ON "LexiconRelease"("compressedArtifactHash");

-- CreateIndex
CREATE UNIQUE INDEX "LexiconRelease_contentHash_key" ON "LexiconRelease"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "LexiconRelease_lexiconId_version_key" ON "LexiconRelease"("lexiconId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "LexiconReleaseLearningLanguage_releaseId_displayOrder_key" ON "LexiconReleaseLearningLanguage"("releaseId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Headword_lexiconId_identityKey_key" ON "Headword"("lexiconId", "identityKey");

-- CreateIndex
CREATE INDEX "HeadwordRevision_releaseId_searchKey_idx" ON "HeadwordRevision"("releaseId", "searchKey");

-- CreateIndex
CREATE UNIQUE INDEX "HeadwordRevision_releaseId_headwordId_key" ON "HeadwordRevision"("releaseId", "headwordId");

-- CreateIndex
CREATE UNIQUE INDEX "LexicalEntry_lexiconId_identityKey_key" ON "LexicalEntry"("lexiconId", "identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "LexicalEntryRevision_releaseId_entryId_key" ON "LexicalEntryRevision"("releaseId", "entryId");

-- CreateIndex
CREATE UNIQUE INDEX "LexicalEntryRevision_releaseId_headwordId_displayOrder_key" ON "LexicalEntryRevision"("releaseId", "headwordId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LexicalForm_releaseId_id_key" ON "LexicalForm"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LexicalForm_releaseId_entryId_displayOrder_key" ON "LexicalForm"("releaseId", "entryId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FormRepresentation_releaseId_id_key" ON "FormRepresentation"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FormRepresentation_releaseId_formId_representationType_lang_key" ON "FormRepresentation"("releaseId", "formId", "representationType", "languageTag", "regionTag", "normalizedText");

-- CreateIndex
CREATE UNIQUE INDEX "LexicalSense_lexiconId_identityKey_key" ON "LexicalSense"("lexiconId", "identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "LexicalSenseRevision_releaseId_senseId_key" ON "LexicalSenseRevision"("releaseId", "senseId");

-- CreateIndex
CREATE UNIQUE INDEX "LexicalSenseRevision_releaseId_entryId_displayOrder_key" ON "LexicalSenseRevision"("releaseId", "entryId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SenseDefinition_releaseId_senseId_languageTag_definitionTyp_key" ON "SenseDefinition"("releaseId", "senseId", "languageTag", "definitionType", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SenseTranslationText_releaseId_senseId_languageTag_displayO_key" ON "SenseTranslationText"("releaseId", "senseId", "languageTag", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SenseUsage_releaseId_senseId_usageTypeCode_displayOrder_key" ON "SenseUsage"("releaseId", "senseId", "usageTypeCode", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LexicalConcept_lexiconId_identityKey_key" ON "LexicalConcept"("lexiconId", "identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "LexicalConceptRevision_releaseId_conceptId_key" ON "LexicalConceptRevision"("releaseId", "conceptId");

-- CreateIndex
CREATE UNIQUE INDEX "SenseConceptMembership_releaseId_senseId_conceptId_membersh_key" ON "SenseConceptMembership"("releaseId", "senseId", "conceptId", "membershipType");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptDefinition_releaseId_conceptId_languageTag_displayOr_key" ON "ConceptDefinition"("releaseId", "conceptId", "languageTag", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Etymon_lexiconId_identityKey_key" ON "Etymon"("lexiconId", "identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "EtymonRevision_releaseId_etymonId_key" ON "EtymonRevision"("releaseId", "etymonId");

-- CreateIndex
CREATE UNIQUE INDEX "EtymologyHypothesis_releaseId_id_key" ON "EtymologyHypothesis"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EtymologyLink_releaseId_hypothesisId_position_key" ON "EtymologyLink"("releaseId", "hypothesisId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Morph_lexiconId_identityKey_key" ON "Morph"("lexiconId", "identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "Morpheme_lexiconId_identityKey_key" ON "Morpheme"("lexiconId", "identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "MorphologicalAnalysis_releaseId_id_key" ON "MorphologicalAnalysis"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InflectionRule_ruleKey_version_key" ON "InflectionRule"("ruleKey", "version");

-- CreateIndex
CREATE UNIQUE INDEX "InflectionGeneration_releaseId_entryId_outputFormId_ruleId_key" ON "InflectionGeneration"("releaseId", "entryId", "outputFormId", "ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "WordFormation_releaseId_id_key" ON "WordFormation"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WordFormationRule_ruleKey_version_key" ON "WordFormationRule"("ruleKey", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationRelation_releaseId_sourceSenseId_targetSenseId_t_key" ON "TranslationRelation"("releaseId", "sourceSenseId", "targetSenseId", "translationType");

-- CreateIndex
CREATE UNIQUE INDEX "LexicalLineage_releaseId_entityKind_fromId_toId_lineageType_key" ON "LexicalLineage"("releaseId", "entityKind", "fromId", "toId", "lineageType");

-- CreateIndex
CREATE UNIQUE INDEX "LexicalExternalIdentifier_releaseId_ownerKind_ownerId_names_key" ON "LexicalExternalIdentifier"("releaseId", "ownerKind", "ownerId", "namespaceVersionId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "SyntacticFrame_releaseId_id_key" ON "SyntacticFrame"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SyntacticFrame_releaseId_entryId_frameKey_key" ON "SyntacticFrame"("releaseId", "entryId", "frameKey");

-- CreateIndex
CREATE UNIQUE INDEX "SyntacticArgument_releaseId_id_key" ON "SyntacticArgument"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SyntacticArgument_releaseId_frameId_position_key" ON "SyntacticArgument"("releaseId", "frameId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SemanticPredicate_releaseId_id_key" ON "SemanticPredicate"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SemanticPredicate_releaseId_senseId_predicateKey_key" ON "SemanticPredicate"("releaseId", "senseId", "predicateKey");

-- CreateIndex
CREATE UNIQUE INDEX "SemanticArgument_releaseId_id_key" ON "SemanticArgument"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SemanticArgument_releaseId_predicateId_position_key" ON "SemanticArgument"("releaseId", "predicateId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SenseFrame_releaseId_id_key" ON "SenseFrame"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SenseFrame_releaseId_senseId_frameId_predicateId_key" ON "SenseFrame"("releaseId", "senseId", "frameId", "predicateId");

-- CreateIndex
CREATE UNIQUE INDEX "Notebook_userId_normalizedTitle_key" ON "Notebook"("userId", "normalizedTitle");

-- CreateIndex
CREATE UNIQUE INDEX "CollectedLexicalItem_notebookId_releaseId_targetKind_target_key" ON "CollectedLexicalItem"("notebookId", "releaseId", "targetKind", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectedLexicalItem_notebookId_position_key" ON "CollectedLexicalItem"("notebookId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_actionDigest_key" ON "ApprovalRequest"("actionDigest");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalDecision_requestId_actorUserId_key" ON "ApprovalDecision"("requestId", "actorUserId");

-- CreateIndex
CREATE INDEX "LexiconReleaseActivation_lexiconId_createdAt_idx" ON "LexiconReleaseActivation"("lexiconId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentRelease_environment_version_key" ON "DeploymentRelease"("environment", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentRelease_environment_gitSha_key" ON "DeploymentRelease"("environment", "gitSha");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewDecision_batchId_actorUserId_key" ON "ReviewDecision"("batchId", "actorUserId");

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_nextAttemptAt_idx" ON "OutboxEvent"("publishedAt", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_actorId_operation_key_key" ON "IdempotencyRecord"("actorId", "operation", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SourceRightsPolicy_key_version_key" ON "SourceRightsPolicy"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDataset_key_key" ON "SourceDataset"("key");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDatasetVersion_checksum_key" ON "SourceDatasetVersion"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDatasetVersion_datasetId_version_key" ON "SourceDatasetVersion"("datasetId", "version");

-- CreateIndex
CREATE INDEX "SourceRecord_rawPayloadHash_idx" ON "SourceRecord"("rawPayloadHash");

-- CreateIndex
CREATE UNIQUE INDEX "SourceRecord_datasetVersionId_sourceKey_key" ON "SourceRecord"("datasetVersionId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "LexiconReleaseSourceInput_releaseId_sourceKey_key" ON "LexiconReleaseSourceInput"("releaseId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "Provenance_contentHash_resolverVersion_decisionReason_key" ON "Provenance"("contentHash", "resolverVersion", "decisionReason");

-- CreateIndex
CREATE INDEX "ArtifactProjectionRecord_releaseId_collectionPath_entityId_idx" ON "ArtifactProjectionRecord"("releaseId", "collectionPath", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingDocument_currentRevisionId_key" ON "ReadingDocument"("currentRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingDocument_sourceKind_externalKey_key" ON "ReadingDocument"("sourceKind", "externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingDocumentRevision_documentId_revisionNo_key" ON "ReadingDocumentRevision"("documentId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingDocumentRevision_documentId_contentHash_key" ON "ReadingDocumentRevision"("documentId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "LexicalAnnotation_revisionId_startOffset_endOffset_targetKi_key" ON "LexicalAnnotation"("revisionId", "startOffset", "endOffset", "targetKind", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingActivity_userId_documentId_key" ON "ReadingActivity"("userId", "documentId");

-- CreateIndex
CREATE INDEX "ReadingActivityEvent_userId_occurredAt_idx" ON "ReadingActivityEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "ReadingActivityEvent_documentId_occurredAt_idx" ON "ReadingActivityEvent"("documentId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedReading_userId_documentId_key" ON "SavedReading"("userId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedReading_userId_releaseId_targetKind_targetId_key" ON "SavedReading"("userId", "releaseId", "targetKind", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "RedditDocumentMetadata_postId_key" ON "RedditDocumentMetadata"("postId");

-- CreateIndex
CREATE INDEX "RedditSourceObservation_documentId_observedAt_idx" ON "RedditSourceObservation"("documentId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RedditSourceObservation_synchronizationId_postId_key" ON "RedditSourceObservation"("synchronizationId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "ProficiencyFramework_key_key" ON "ProficiencyFramework"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ProficiencyFrameworkVersion_frameworkId_version_key" ON "ProficiencyFrameworkVersion"("frameworkId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProficiencyLevel_versionId_code_key" ON "ProficiencyLevel"("versionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProficiencyLevel_versionId_rank_key" ON "ProficiencyLevel"("versionId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "ProficiencyClaim_releaseId_levelId_targetKind_targetId_clai_key" ON "ProficiencyClaim"("releaseId", "levelId", "targetKind", "targetId", "claimType");

-- CreateIndex
CREATE UNIQUE INDEX "LearningObjective_lexiconId_identityKey_key" ON "LearningObjective"("lexiconId", "identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "LearningObjectiveRevision_releaseId_objectiveId_key" ON "LearningObjectiveRevision"("releaseId", "objectiveId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningObjectiveRevision_releaseId_id_key" ON "LearningObjectiveRevision"("releaseId", "id");

-- CreateIndex
CREATE INDEX "LearningObjectiveSubject_targetKind_targetId_idx" ON "LearningObjectiveSubject"("targetKind", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningObjectiveHint_releaseId_objectiveRevisionId_display_key" ON "LearningObjectiveHint"("releaseId", "objectiveRevisionId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PedagogicalMaterial_lexiconId_identityKey_key" ON "PedagogicalMaterial"("lexiconId", "identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "PedagogicalMaterialRevision_releaseId_materialId_key" ON "PedagogicalMaterialRevision"("releaseId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "PedagogicalMaterialRevision_releaseId_id_key" ON "PedagogicalMaterialRevision"("releaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PedagogicalMaterialBlock_releaseId_materialRevisionId_posit_key" ON "PedagogicalMaterialBlock"("releaseId", "materialRevisionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PedagogicalMaterialMention_materialBlockId_startOffset_endO_key" ON "PedagogicalMaterialMention"("materialBlockId", "startOffset", "endOffset", "targetKind", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "PedagogicalMaterialCitation_materialBlockId_contentEvidence_key" ON "PedagogicalMaterialCitation"("materialBlockId", "contentEvidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBookEnrollment_userId_bookId_editionId_key" ON "UserBookEnrollment"("userId", "bookId", "editionId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStudyPlan_userId_localDate_key" ON "DailyStudyPlan"("userId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStudyPlanItem_planId_position_key" ON "DailyStudyPlanItem"("planId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStudyPlanItem_planId_objectiveRevisionId_key" ON "DailyStudyPlanItem"("planId", "objectiveRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "FSRSParameterSet_version_key" ON "FSRSParameterSet"("version");

-- CreateIndex
CREATE UNIQUE INDEX "FSRSParameterSet_contentHash_key" ON "FSRSParameterSet"("contentHash");

-- CreateIndex
CREATE INDEX "UserObjectiveMemoryState_userId_dueAt_idx" ON "UserObjectiveMemoryState"("userId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserObjectiveMemoryState_userId_objectiveId_key" ON "UserObjectiveMemoryState"("userId", "objectiveId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewEvent_attemptId_key" ON "ReviewEvent"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewEvent_userId_idempotencyKey_key" ON "ReviewEvent"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewStateSnapshot_reviewId_phase_key" ON "ReviewStateSnapshot"("reviewId", "phase");

-- AddForeignKey
ALTER TABLE "ReadingGeneration" ADD CONSTRAINT "ReadingGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingGeneration" ADD CONSTRAINT "ReadingGeneration_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingGeneration" ADD CONSTRAINT "ReadingGeneration_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ReadingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelInvocation" ADD CONSTRAINT "ModelInvocation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageLedger" ADD CONSTRAINT "AIUsageLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorSession" ADD CONSTRAINT "TutorSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorMessage" ADD CONSTRAINT "TutorMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TutorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorMessage" ADD CONSTRAINT "TutorMessage_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "TutorMessageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorMessage" ADD CONSTRAINT "TutorMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorMessageRevision" ADD CONSTRAINT "TutorMessageRevision_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TutorMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorContextRef" ADD CONSTRAINT "TutorContextRef_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TutorMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrammarDiagnosis" ADD CONSTRAINT "GrammarDiagnosis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrammarDiagnosis" ADD CONSTRAINT "GrammarDiagnosis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentBlueprintRevision" ADD CONSTRAINT "AssessmentBlueprintRevision_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "AssessmentBlueprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentBlueprintRevision" ADD CONSTRAINT "AssessmentBlueprintRevision_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSection" ADD CONSTRAINT "AssessmentSection_blueprintRevisionId_fkey" FOREIGN KEY ("blueprintRevisionId") REFERENCES "AssessmentBlueprintRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSection" ADD CONSTRAINT "AssessmentSection_parentSectionId_fkey" FOREIGN KEY ("parentSectionId") REFERENCES "AssessmentSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSelectionRule" ADD CONSTRAINT "AssessmentSelectionRule_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "AssessmentSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSession" ADD CONSTRAINT "AssessmentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSession" ADD CONSTRAINT "AssessmentSession_blueprintRevisionId_fkey" FOREIGN KEY ("blueprintRevisionId") REFERENCES "AssessmentBlueprintRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSessionItem" ADD CONSTRAINT "AssessmentSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AssessmentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSessionItem" ADD CONSTRAINT "AssessmentSessionItem_assessmentSectionId_fkey" FOREIGN KEY ("assessmentSectionId") REFERENCES "AssessmentSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AssessmentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityAuditEvent" ADD CONSTRAINT "SecurityAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularyBookEdition" ADD CONSTRAINT "VocabularyBookEdition_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "VocabularyBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularyBookEdition" ADD CONSTRAINT "VocabularyBookEdition_sourceDatasetVersionId_fkey" FOREIGN KEY ("sourceDatasetVersionId") REFERENCES "SourceDatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexiconReleaseBookEdition" ADD CONSTRAINT "LexiconReleaseBookEdition_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "LexiconRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexiconReleaseBookEdition" ADD CONSTRAINT "LexiconReleaseBookEdition_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "VocabularyBookEdition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularyBookItem" ADD CONSTRAINT "VocabularyBookItem_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "VocabularyBookEdition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentProfileVersion" ADD CONSTRAINT "ContentProfileVersion_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ContentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentProfileEvaluation" ADD CONSTRAINT "ContentProfileEvaluation_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "ContentProfileVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentProfileEvaluationTarget" ADD CONSTRAINT "ContentProfileEvaluationTarget_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "ContentProfileEvaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRequirementEvaluation" ADD CONSTRAINT "ContentRequirementEvaluation_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "ContentProfileEvaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorpusDatasetVersion" ADD CONSTRAINT "CorpusDatasetVersion_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "CorpusDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorpusDatasetVersion" ADD CONSTRAINT "CorpusDatasetVersion_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attestation" ADD CONSTRAINT "Attestation_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "CorpusDatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attestation" ADD CONSTRAINT "Attestation_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "SourceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attestation" ADD CONSTRAINT "Attestation_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollocationObservation" ADD CONSTRAINT "CollocationObservation_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "CorpusDatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollocationObservation" ADD CONSTRAINT "CollocationObservation_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrequencyObservation" ADD CONSTRAINT "FrequencyObservation_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "CorpusDatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrequencyObservation" ADD CONSTRAINT "FrequencyObservation_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentStimulusRevision" ADD CONSTRAINT "AssessmentStimulusRevision_stimulusId_fkey" FOREIGN KEY ("stimulusId") REFERENCES "AssessmentStimulus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentStimulusRevision" ADD CONSTRAINT "AssessmentStimulusRevision_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentStimulusBlock" ADD CONSTRAINT "AssessmentStimulusBlock_releaseId_stimulusRevisionId_fkey" FOREIGN KEY ("releaseId", "stimulusRevisionId") REFERENCES "AssessmentStimulusRevision"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseItem" ADD CONSTRAINT "ExerciseItem_learningObjectiveId_fkey" FOREIGN KEY ("learningObjectiveId") REFERENCES "LearningObjective"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseRevision" ADD CONSTRAINT "ExerciseRevision_exerciseItemId_fkey" FOREIGN KEY ("exerciseItemId") REFERENCES "ExerciseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseRevision" ADD CONSTRAINT "ExerciseRevision_releaseId_learningObjectiveRevisionId_fkey" FOREIGN KEY ("releaseId", "learningObjectiveRevisionId") REFERENCES "LearningObjectiveRevision"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseRevision" ADD CONSTRAINT "ExerciseRevision_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseStimulusRef" ADD CONSTRAINT "ExerciseStimulusRef_exerciseRevisionId_fkey" FOREIGN KEY ("exerciseRevisionId") REFERENCES "ExerciseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseStimulusRef" ADD CONSTRAINT "ExerciseStimulusRef_stimulusRevisionId_fkey" FOREIGN KEY ("stimulusRevisionId") REFERENCES "AssessmentStimulusRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseResponseConfig" ADD CONSTRAINT "ExerciseResponseConfig_exerciseRevisionId_fkey" FOREIGN KEY ("exerciseRevisionId") REFERENCES "ExerciseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseChoice" ADD CONSTRAINT "ExerciseChoice_exerciseRevisionId_fkey" FOREIGN KEY ("exerciseRevisionId") REFERENCES "ExerciseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseChoiceTarget" ADD CONSTRAINT "ExerciseChoiceTarget_choiceId_fkey" FOREIGN KEY ("choiceId") REFERENCES "ExerciseChoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseCorrectChoice" ADD CONSTRAINT "ExerciseCorrectChoice_exerciseRevisionId_fkey" FOREIGN KEY ("exerciseRevisionId") REFERENCES "ExerciseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseCorrectChoice" ADD CONSTRAINT "ExerciseCorrectChoice_choiceId_fkey" FOREIGN KEY ("choiceId") REFERENCES "ExerciseChoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAcceptedText" ADD CONSTRAINT "ExerciseAcceptedText_exerciseRevisionId_fkey" FOREIGN KEY ("exerciseRevisionId") REFERENCES "ExerciseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseFeedback" ADD CONSTRAINT "ExerciseFeedback_exerciseRevisionId_fkey" FOREIGN KEY ("exerciseRevisionId") REFERENCES "ExerciseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseRubricCriterion" ADD CONSTRAINT "ExerciseRubricCriterion_exerciseRevisionId_fkey" FOREIGN KEY ("exerciseRevisionId") REFERENCES "ExerciseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAttempt" ADD CONSTRAINT "ExerciseAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAttempt" ADD CONSTRAINT "ExerciseAttempt_exerciseRevisionId_fkey" FOREIGN KEY ("exerciseRevisionId") REFERENCES "ExerciseRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAttempt" ADD CONSTRAINT "ExerciseAttempt_dailyStudyPlanItemId_fkey" FOREIGN KEY ("dailyStudyPlanItemId") REFERENCES "DailyStudyPlanItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAttempt" ADD CONSTRAINT "ExerciseAttempt_assessmentSessionItemId_fkey" FOREIGN KEY ("assessmentSessionItemId") REFERENCES "AssessmentSessionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptPresentedChoice" ADD CONSTRAINT "AttemptPresentedChoice_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExerciseAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptPresentedChoice" ADD CONSTRAINT "AttemptPresentedChoice_choiceId_fkey" FOREIGN KEY ("choiceId") REFERENCES "ExerciseChoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptSelectedChoice" ADD CONSTRAINT "AttemptSelectedChoice_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExerciseAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptSelectedChoice" ADD CONSTRAINT "AttemptSelectedChoice_choiceId_fkey" FOREIGN KEY ("choiceId") REFERENCES "ExerciseChoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptTextResponse" ADD CONSTRAINT "AttemptTextResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExerciseAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptSelfReport" ADD CONSTRAINT "AttemptSelfReport_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExerciseAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEmail" ADD CONSTRAINT "UserEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordCredential" ADD CONSTRAINT "PasswordCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaCredential" ADD CONSTRAINT "MfaCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorRoleAssignment" ADD CONSTRAINT "OperatorRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_supersedesJobId_fkey" FOREIGN KEY ("supersedesJobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobProgressEvent" ADD CONSTRAINT "JobProgressEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCheckpoint" ADD CONSTRAINT "JobCheckpoint_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildRun" ADD CONSTRAINT "BuildRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexiconValidationRequest" ADD CONSTRAINT "LexiconValidationRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSynchronization" ADD CONSTRAINT "SourceSynchronization_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_rightsPolicyId_fkey" FOREIGN KEY ("rightsPolicyId") REFERENCES "SourceRightsPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormMedia" ADD CONSTRAINT "FormMedia_releaseId_formId_fkey" FOREIGN KEY ("releaseId", "formId") REFERENCES "LexicalForm"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormMedia" ADD CONSTRAINT "FormMedia_releaseId_mediaAssetId_fkey" FOREIGN KEY ("releaseId", "mediaAssetId") REFERENCES "MediaAsset"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryRelation" ADD CONSTRAINT "EntryRelation_releaseId_sourceEntryId_fkey" FOREIGN KEY ("releaseId", "sourceEntryId") REFERENCES "LexicalEntryRevision"("releaseId", "entryId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryRelation" ADD CONSTRAINT "EntryRelation_releaseId_targetEntryId_fkey" FOREIGN KEY ("releaseId", "targetEntryId") REFERENCES "LexicalEntryRevision"("releaseId", "entryId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryRelation" ADD CONSTRAINT "EntryRelation_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseRelation" ADD CONSTRAINT "SenseRelation_releaseId_sourceSenseId_fkey" FOREIGN KEY ("releaseId", "sourceSenseId") REFERENCES "LexicalSenseRevision"("releaseId", "senseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseRelation" ADD CONSTRAINT "SenseRelation_releaseId_targetSenseId_fkey" FOREIGN KEY ("releaseId", "targetSenseId") REFERENCES "LexicalSenseRevision"("releaseId", "senseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseRelation" ADD CONSTRAINT "SenseRelation_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptRelation" ADD CONSTRAINT "ConceptRelation_releaseId_sourceConceptId_fkey" FOREIGN KEY ("releaseId", "sourceConceptId") REFERENCES "LexicalConceptRevision"("releaseId", "conceptId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptRelation" ADD CONSTRAINT "ConceptRelation_releaseId_targetConceptId_fkey" FOREIGN KEY ("releaseId", "targetConceptId") REFERENCES "LexicalConceptRevision"("releaseId", "conceptId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptRelation" ADD CONSTRAINT "ConceptRelation_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExampleSentence" ADD CONSTRAINT "ExampleSentence_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExampleTranslation" ADD CONSTRAINT "ExampleTranslation_releaseId_exampleId_fkey" FOREIGN KEY ("releaseId", "exampleId") REFERENCES "ExampleSentence"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExampleTranslation" ADD CONSTRAINT "ExampleTranslation_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseExample" ADD CONSTRAINT "SenseExample_releaseId_senseId_fkey" FOREIGN KEY ("releaseId", "senseId") REFERENCES "LexicalSenseRevision"("releaseId", "senseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseExample" ADD CONSTRAINT "SenseExample_releaseId_exampleId_fkey" FOREIGN KEY ("releaseId", "exampleId") REFERENCES "ExampleSentence"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseExample" ADD CONSTRAINT "SenseExample_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExampleCitation" ADD CONSTRAINT "ExampleCitation_exampleId_fkey" FOREIGN KEY ("exampleId") REFERENCES "ExampleSentence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExampleCitation" ADD CONSTRAINT "ExampleCitation_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "SourceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collocation" ADD CONSTRAINT "Collocation_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseCollocation" ADD CONSTRAINT "SenseCollocation_releaseId_senseId_fkey" FOREIGN KEY ("releaseId", "senseId") REFERENCES "LexicalSenseRevision"("releaseId", "senseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseCollocation" ADD CONSTRAINT "SenseCollocation_releaseId_collocationId_fkey" FOREIGN KEY ("releaseId", "collocationId") REFERENCES "Collocation"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseCollocation" ADD CONSTRAINT "SenseCollocation_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollocationComponent" ADD CONSTRAINT "CollocationComponent_collocationId_fkey" FOREIGN KEY ("collocationId") REFERENCES "Collocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lexicon" ADD CONSTRAINT "Lexicon_activeReleaseId_fkey" FOREIGN KEY ("activeReleaseId") REFERENCES "LexiconRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularyNamespaceVersion" ADD CONSTRAINT "VocabularyNamespaceVersion_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "VocabularyBundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularyTerm" ADD CONSTRAINT "VocabularyTerm_namespaceVersionId_fkey" FOREIGN KEY ("namespaceVersionId") REFERENCES "VocabularyNamespaceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularyTerm" ADD CONSTRAINT "VocabularyTerm_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "VocabularyTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexiconRelease" ADD CONSTRAINT "LexiconRelease_lexiconId_fkey" FOREIGN KEY ("lexiconId") REFERENCES "Lexicon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexiconRelease" ADD CONSTRAINT "LexiconRelease_textProfileId_fkey" FOREIGN KEY ("textProfileId") REFERENCES "TextProcessingProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexiconRelease" ADD CONSTRAINT "LexiconRelease_vocabularyBundleId_fkey" FOREIGN KEY ("vocabularyBundleId") REFERENCES "VocabularyBundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexiconReleaseBuildMetadata" ADD CONSTRAINT "LexiconReleaseBuildMetadata_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "LexiconRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexiconReleaseLearningLanguage" ADD CONSTRAINT "LexiconReleaseLearningLanguage_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "LexiconRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Headword" ADD CONSTRAINT "Headword_lexiconId_fkey" FOREIGN KEY ("lexiconId") REFERENCES "Lexicon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadwordRevision" ADD CONSTRAINT "HeadwordRevision_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "LexiconRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadwordRevision" ADD CONSTRAINT "HeadwordRevision_headwordId_fkey" FOREIGN KEY ("headwordId") REFERENCES "Headword"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalEntry" ADD CONSTRAINT "LexicalEntry_lexiconId_fkey" FOREIGN KEY ("lexiconId") REFERENCES "Lexicon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalEntryRevision" ADD CONSTRAINT "LexicalEntryRevision_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "LexiconRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalEntryRevision" ADD CONSTRAINT "LexicalEntryRevision_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LexicalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalEntryRevision" ADD CONSTRAINT "LexicalEntryRevision_releaseId_headwordId_fkey" FOREIGN KEY ("releaseId", "headwordId") REFERENCES "HeadwordRevision"("releaseId", "headwordId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalEntryRevision" ADD CONSTRAINT "LexicalEntryRevision_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalForm" ADD CONSTRAINT "LexicalForm_releaseId_entryId_fkey" FOREIGN KEY ("releaseId", "entryId") REFERENCES "LexicalEntryRevision"("releaseId", "entryId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalForm" ADD CONSTRAINT "LexicalForm_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormRepresentation" ADD CONSTRAINT "FormRepresentation_releaseId_formId_fkey" FOREIGN KEY ("releaseId", "formId") REFERENCES "LexicalForm"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormRepresentation" ADD CONSTRAINT "FormRepresentation_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormFeature" ADD CONSTRAINT "FormFeature_releaseId_formId_fkey" FOREIGN KEY ("releaseId", "formId") REFERENCES "LexicalForm"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalSense" ADD CONSTRAINT "LexicalSense_lexiconId_fkey" FOREIGN KEY ("lexiconId") REFERENCES "Lexicon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalSenseRevision" ADD CONSTRAINT "LexicalSenseRevision_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "LexiconRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalSenseRevision" ADD CONSTRAINT "LexicalSenseRevision_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "LexicalSense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalSenseRevision" ADD CONSTRAINT "LexicalSenseRevision_releaseId_entryId_fkey" FOREIGN KEY ("releaseId", "entryId") REFERENCES "LexicalEntryRevision"("releaseId", "entryId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalSenseRevision" ADD CONSTRAINT "LexicalSenseRevision_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalSenseRevision" ADD CONSTRAINT "LexicalSenseRevision_releaseId_parentSenseId_fkey" FOREIGN KEY ("releaseId", "parentSenseId") REFERENCES "LexicalSenseRevision"("releaseId", "senseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseDefinition" ADD CONSTRAINT "SenseDefinition_releaseId_senseId_fkey" FOREIGN KEY ("releaseId", "senseId") REFERENCES "LexicalSenseRevision"("releaseId", "senseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseDefinition" ADD CONSTRAINT "SenseDefinition_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseTranslationText" ADD CONSTRAINT "SenseTranslationText_releaseId_senseId_fkey" FOREIGN KEY ("releaseId", "senseId") REFERENCES "LexicalSenseRevision"("releaseId", "senseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseTranslationText" ADD CONSTRAINT "SenseTranslationText_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseUsage" ADD CONSTRAINT "SenseUsage_releaseId_senseId_fkey" FOREIGN KEY ("releaseId", "senseId") REFERENCES "LexicalSenseRevision"("releaseId", "senseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseUsage" ADD CONSTRAINT "SenseUsage_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalConcept" ADD CONSTRAINT "LexicalConcept_lexiconId_fkey" FOREIGN KEY ("lexiconId") REFERENCES "Lexicon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalConceptRevision" ADD CONSTRAINT "LexicalConceptRevision_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "LexiconRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalConceptRevision" ADD CONSTRAINT "LexicalConceptRevision_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "LexicalConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalConceptRevision" ADD CONSTRAINT "LexicalConceptRevision_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseConceptMembership" ADD CONSTRAINT "SenseConceptMembership_releaseId_senseId_fkey" FOREIGN KEY ("releaseId", "senseId") REFERENCES "LexicalSenseRevision"("releaseId", "senseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseConceptMembership" ADD CONSTRAINT "SenseConceptMembership_releaseId_conceptId_fkey" FOREIGN KEY ("releaseId", "conceptId") REFERENCES "LexicalConceptRevision"("releaseId", "conceptId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseConceptMembership" ADD CONSTRAINT "SenseConceptMembership_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptDefinition" ADD CONSTRAINT "ConceptDefinition_releaseId_conceptId_fkey" FOREIGN KEY ("releaseId", "conceptId") REFERENCES "LexicalConceptRevision"("releaseId", "conceptId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptDefinition" ADD CONSTRAINT "ConceptDefinition_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etymon" ADD CONSTRAINT "Etymon_lexiconId_fkey" FOREIGN KEY ("lexiconId") REFERENCES "Lexicon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtymonRevision" ADD CONSTRAINT "EtymonRevision_etymonId_fkey" FOREIGN KEY ("etymonId") REFERENCES "Etymon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtymonRevision" ADD CONSTRAINT "EtymonRevision_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtymologyHypothesis" ADD CONSTRAINT "EtymologyHypothesis_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtymologyLink" ADD CONSTRAINT "EtymologyLink_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "EtymologyHypothesis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtymologyLink" ADD CONSTRAINT "EtymologyLink_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Morph" ADD CONSTRAINT "Morph_lexiconId_fkey" FOREIGN KEY ("lexiconId") REFERENCES "Lexicon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Morph" ADD CONSTRAINT "Morph_morphemeId_fkey" FOREIGN KEY ("morphemeId") REFERENCES "Morpheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Morpheme" ADD CONSTRAINT "Morpheme_lexiconId_fkey" FOREIGN KEY ("lexiconId") REFERENCES "Lexicon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MorphologicalAnalysis" ADD CONSTRAINT "MorphologicalAnalysis_releaseId_formRepresentationId_fkey" FOREIGN KEY ("releaseId", "formRepresentationId") REFERENCES "FormRepresentation"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MorphologicalAnalysis" ADD CONSTRAINT "MorphologicalAnalysis_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MorphologicalSegment" ADD CONSTRAINT "MorphologicalSegment_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "MorphologicalAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MorphologicalSegment" ADD CONSTRAINT "MorphologicalSegment_morphId_fkey" FOREIGN KEY ("morphId") REFERENCES "Morph"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MorphologicalSegment" ADD CONSTRAINT "MorphologicalSegment_morphemeId_fkey" FOREIGN KEY ("morphemeId") REFERENCES "Morpheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InflectionRule" ADD CONSTRAINT "InflectionRule_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InflectionGeneration" ADD CONSTRAINT "InflectionGeneration_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "InflectionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InflectionGeneration" ADD CONSTRAINT "InflectionGeneration_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordFormation" ADD CONSTRAINT "WordFormation_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordFormationInput" ADD CONSTRAINT "WordFormationInput_formationId_fkey" FOREIGN KEY ("formationId") REFERENCES "WordFormation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordFormationInput" ADD CONSTRAINT "WordFormationInput_morphemeId_fkey" FOREIGN KEY ("morphemeId") REFERENCES "Morpheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordFormationRule" ADD CONSTRAINT "WordFormationRule_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordFormationApplication" ADD CONSTRAINT "WordFormationApplication_formationId_fkey" FOREIGN KEY ("formationId") REFERENCES "WordFormation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordFormationApplication" ADD CONSTRAINT "WordFormationApplication_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "WordFormationRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationRelation" ADD CONSTRAINT "TranslationRelation_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalLineage" ADD CONSTRAINT "LexicalLineage_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalExternalIdentifier" ADD CONSTRAINT "LexicalExternalIdentifier_namespaceVersionId_fkey" FOREIGN KEY ("namespaceVersionId") REFERENCES "VocabularyNamespaceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalExternalIdentifier" ADD CONSTRAINT "LexicalExternalIdentifier_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntacticFrame" ADD CONSTRAINT "SyntacticFrame_releaseId_entryId_fkey" FOREIGN KEY ("releaseId", "entryId") REFERENCES "LexicalEntryRevision"("releaseId", "entryId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntacticFrame" ADD CONSTRAINT "SyntacticFrame_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntacticArgument" ADD CONSTRAINT "SyntacticArgument_releaseId_frameId_fkey" FOREIGN KEY ("releaseId", "frameId") REFERENCES "SyntacticFrame"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemanticPredicate" ADD CONSTRAINT "SemanticPredicate_releaseId_senseId_fkey" FOREIGN KEY ("releaseId", "senseId") REFERENCES "LexicalSenseRevision"("releaseId", "senseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemanticPredicate" ADD CONSTRAINT "SemanticPredicate_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemanticArgument" ADD CONSTRAINT "SemanticArgument_releaseId_predicateId_fkey" FOREIGN KEY ("releaseId", "predicateId") REFERENCES "SemanticPredicate"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseFrame" ADD CONSTRAINT "SenseFrame_releaseId_senseId_fkey" FOREIGN KEY ("releaseId", "senseId") REFERENCES "LexicalSenseRevision"("releaseId", "senseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseFrame" ADD CONSTRAINT "SenseFrame_releaseId_frameId_fkey" FOREIGN KEY ("releaseId", "frameId") REFERENCES "SyntacticFrame"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseFrame" ADD CONSTRAINT "SenseFrame_releaseId_predicateId_fkey" FOREIGN KEY ("releaseId", "predicateId") REFERENCES "SemanticPredicate"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenseFrame" ADD CONSTRAINT "SenseFrame_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArgumentMapping" ADD CONSTRAINT "ArgumentMapping_senseFrameId_fkey" FOREIGN KEY ("senseFrameId") REFERENCES "SenseFrame"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArgumentMapping" ADD CONSTRAINT "ArgumentMapping_syntacticArgumentId_fkey" FOREIGN KEY ("syntacticArgumentId") REFERENCES "SyntacticArgument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArgumentMapping" ADD CONSTRAINT "ArgumentMapping_semanticArgumentId_fkey" FOREIGN KEY ("semanticArgumentId") REFERENCES "SemanticArgument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notebook" ADD CONSTRAINT "Notebook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectedLexicalItem" ADD CONSTRAINT "CollectedLexicalItem_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "Notebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexiconReleaseActivation" ADD CONSTRAINT "LexiconReleaseActivation_lexiconId_fkey" FOREIGN KEY ("lexiconId") REFERENCES "Lexicon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexiconReleaseActivation" ADD CONSTRAINT "LexiconReleaseActivation_fromReleaseId_fkey" FOREIGN KEY ("fromReleaseId") REFERENCES "LexiconRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexiconReleaseActivation" ADD CONSTRAINT "LexiconReleaseActivation_toReleaseId_fkey" FOREIGN KEY ("toReleaseId") REFERENCES "LexiconRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexiconReleaseActivation" ADD CONSTRAINT "LexiconReleaseActivation_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexiconReleaseActivation" ADD CONSTRAINT "LexiconReleaseActivation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ReviewBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDatasetVersion" ADD CONSTRAINT "SourceDatasetVersion_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "SourceDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDatasetVersion" ADD CONSTRAINT "SourceDatasetVersion_rightsPolicyId_fkey" FOREIGN KEY ("rightsPolicyId") REFERENCES "SourceRightsPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "SourceDatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRestriction" ADD CONSTRAINT "SourceRestriction_rightsPolicyId_fkey" FOREIGN KEY ("rightsPolicyId") REFERENCES "SourceRightsPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRestriction" ADD CONSTRAINT "SourceRestriction_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "SourceDatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexiconReleaseSourceInput" ADD CONSTRAINT "LexiconReleaseSourceInput_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "LexiconRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexiconReleaseSourceInput" ADD CONSTRAINT "LexiconReleaseSourceInput_sourceDatasetVersionId_fkey" FOREIGN KEY ("sourceDatasetVersionId") REFERENCES "SourceDatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentEvidence" ADD CONSTRAINT "ContentEvidence_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentEvidence" ADD CONSTRAINT "ContentEvidence_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "SourceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentEvidence" ADD CONSTRAINT "ContentEvidence_upstreamProvenanceId_fkey" FOREIGN KEY ("upstreamProvenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactProjectionRecord" ADD CONSTRAINT "ArtifactProjectionRecord_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "LexiconRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingDocument" ADD CONSTRAINT "ReadingDocument_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "ReadingDocumentRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingDocumentRevision" ADD CONSTRAINT "ReadingDocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ReadingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexicalAnnotation" ADD CONSTRAINT "LexicalAnnotation_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ReadingDocumentRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingActivity" ADD CONSTRAINT "ReadingActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingActivity" ADD CONSTRAINT "ReadingActivity_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ReadingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingActivityEvent" ADD CONSTRAINT "ReadingActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingActivityEvent" ADD CONSTRAINT "ReadingActivityEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ReadingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedReading" ADD CONSTRAINT "SavedReading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedReading" ADD CONSTRAINT "SavedReading_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ReadingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedditDocumentMetadata" ADD CONSTRAINT "RedditDocumentMetadata_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ReadingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedditSourceObservation" ADD CONSTRAINT "RedditSourceObservation_synchronizationId_fkey" FOREIGN KEY ("synchronizationId") REFERENCES "SourceSynchronization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedditSourceObservation" ADD CONSTRAINT "RedditSourceObservation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ReadingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyFramework" ADD CONSTRAINT "ProficiencyFramework_sourceDatasetId_fkey" FOREIGN KEY ("sourceDatasetId") REFERENCES "SourceDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyFrameworkVersion" ADD CONSTRAINT "ProficiencyFrameworkVersion_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "ProficiencyFramework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyFrameworkVersion" ADD CONSTRAINT "ProficiencyFrameworkVersion_sourceDatasetVersionId_fkey" FOREIGN KEY ("sourceDatasetVersionId") REFERENCES "SourceDatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyLevel" ADD CONSTRAINT "ProficiencyLevel_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProficiencyFrameworkVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyClaim" ADD CONSTRAINT "ProficiencyClaim_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "ProficiencyLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProficiencyClaim" ADD CONSTRAINT "ProficiencyClaim_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningObjectiveRevision" ADD CONSTRAINT "LearningObjectiveRevision_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "LearningObjective"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningObjectiveRevision" ADD CONSTRAINT "LearningObjectiveRevision_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningObjectiveSubject" ADD CONSTRAINT "LearningObjectiveSubject_objectiveRevisionId_fkey" FOREIGN KEY ("objectiveRevisionId") REFERENCES "LearningObjectiveRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningObjectiveHint" ADD CONSTRAINT "LearningObjectiveHint_releaseId_objectiveRevisionId_fkey" FOREIGN KEY ("releaseId", "objectiveRevisionId") REFERENCES "LearningObjectiveRevision"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningObjectiveHint" ADD CONSTRAINT "LearningObjectiveHint_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedagogicalMaterialRevision" ADD CONSTRAINT "PedagogicalMaterialRevision_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "PedagogicalMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedagogicalMaterialRevision" ADD CONSTRAINT "PedagogicalMaterialRevision_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "Provenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedagogicalMaterialTarget" ADD CONSTRAINT "PedagogicalMaterialTarget_materialRevisionId_fkey" FOREIGN KEY ("materialRevisionId") REFERENCES "PedagogicalMaterialRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedagogicalMaterialBlock" ADD CONSTRAINT "PedagogicalMaterialBlock_releaseId_materialRevisionId_fkey" FOREIGN KEY ("releaseId", "materialRevisionId") REFERENCES "PedagogicalMaterialRevision"("releaseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedagogicalMaterialMention" ADD CONSTRAINT "PedagogicalMaterialMention_materialBlockId_fkey" FOREIGN KEY ("materialBlockId") REFERENCES "PedagogicalMaterialBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedagogicalMaterialCitation" ADD CONSTRAINT "PedagogicalMaterialCitation_materialBlockId_fkey" FOREIGN KEY ("materialBlockId") REFERENCES "PedagogicalMaterialBlock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedagogicalMaterialCitation" ADD CONSTRAINT "PedagogicalMaterialCitation_contentEvidenceId_fkey" FOREIGN KEY ("contentEvidenceId") REFERENCES "ContentEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBookEnrollment" ADD CONSTRAINT "UserBookEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBookEnrollment" ADD CONSTRAINT "UserBookEnrollment_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "VocabularyBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBookEnrollment" ADD CONSTRAINT "UserBookEnrollment_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "VocabularyBookEdition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStudyPlan" ADD CONSTRAINT "DailyStudyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStudyPlan" ADD CONSTRAINT "DailyStudyPlan_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "UserBookEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStudyPlan" ADD CONSTRAINT "DailyStudyPlan_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "LexiconRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStudyPlanItem" ADD CONSTRAINT "DailyStudyPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DailyStudyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserObjectiveMemoryState" ADD CONSTRAINT "UserObjectiveMemoryState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserObjectiveMemoryState" ADD CONSTRAINT "UserObjectiveMemoryState_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "LearningObjective"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserObjectiveMemoryState" ADD CONSTRAINT "UserObjectiveMemoryState_objectiveRevisionId_fkey" FOREIGN KEY ("objectiveRevisionId") REFERENCES "LearningObjectiveRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExerciseAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_objectiveRevisionId_fkey" FOREIGN KEY ("objectiveRevisionId") REFERENCES "LearningObjectiveRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_parameterSetId_fkey" FOREIGN KEY ("parameterSetId") REFERENCES "FSRSParameterSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewStateSnapshot" ADD CONSTRAINT "ReviewStateSnapshot_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ReviewEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database invariants that Prisma cannot represent.
ALTER TABLE "SourceRightsPolicy"
  ADD CONSTRAINT "SourceRightsPolicy_effective_range_check"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  ADD CONSTRAINT "SourceRightsPolicy_attribution_check"
  CHECK (NOT "requiresAttribution" OR nullif(btrim("attribution"), '') IS NOT NULL);

ALTER TABLE "ContentEvidence"
  ADD CONSTRAINT "ContentEvidence_source_xor_upstream_check"
  CHECK (num_nonnulls("sourceRecordId", "upstreamProvenanceId") = 1);

ALTER TABLE "EntryRelation"
  ADD CONSTRAINT "EntryRelation_distinct_endpoints_check"
  CHECK ("sourceEntryId" <> "targetEntryId"),
  ADD CONSTRAINT "EntryRelation_symmetric_order_check"
  CHECK ("direction" <> 'SYMMETRIC' OR "sourceEntryId"::text < "targetEntryId"::text);

ALTER TABLE "SenseRelation"
  ADD CONSTRAINT "SenseRelation_distinct_endpoints_check"
  CHECK ("sourceSenseId" <> "targetSenseId"),
  ADD CONSTRAINT "SenseRelation_symmetric_order_check"
  CHECK ("direction" <> 'SYMMETRIC' OR "sourceSenseId"::text < "targetSenseId"::text);

ALTER TABLE "ConceptRelation"
  ADD CONSTRAINT "ConceptRelation_distinct_endpoints_check"
  CHECK ("sourceConceptId" <> "targetConceptId"),
  ADD CONSTRAINT "ConceptRelation_symmetric_order_check"
  CHECK ("direction" <> 'SYMMETRIC' OR "sourceConceptId"::text < "targetConceptId"::text);

CREATE UNIQUE INDEX "EntryRelation_symmetric_unique"
  ON "EntryRelation" ("releaseId", LEAST("sourceEntryId", "targetEntryId"), GREATEST("sourceEntryId", "targetEntryId"), "typeCode")
  WHERE "direction" = 'SYMMETRIC';
CREATE UNIQUE INDEX "SenseRelation_symmetric_unique"
  ON "SenseRelation" ("releaseId", LEAST("sourceSenseId", "targetSenseId"), GREATEST("sourceSenseId", "targetSenseId"), "typeCode")
  WHERE "direction" = 'SYMMETRIC';
CREATE UNIQUE INDEX "ConceptRelation_symmetric_unique"
  ON "ConceptRelation" ("releaseId", LEAST("sourceConceptId", "targetConceptId"), GREATEST("sourceConceptId", "targetConceptId"), "typeCode")
  WHERE "direction" = 'SYMMETRIC';

CREATE UNIQUE INDEX "SenseConceptMembership_one_canonical_per_sense"
  ON "SenseConceptMembership" ("releaseId", "senseId")
  WHERE "canonical";

ALTER TABLE "ExerciseRevision"
  ADD CONSTRAINT "ExerciseRevision_positive_score_check" CHECK ("maxScore" > 0),
  ADD CONSTRAINT "ExerciseRevision_unverified_response_check" CHECK (
    "validationLevel" <> 'SUMMATIVE_VERIFIED'
    OR ("responseKind" <> 'NO_CAPTURE' AND "gradingMode" NOT IN ('SELF_REPORT', 'AI_ONLY'))
  ),
  ADD CONSTRAINT "ExerciseRevision_spoken_form_policy_check" CHECK (
    "exerciseTaskKind" <> 'SPOKEN_FORM_PRODUCTION'
    OR (
      "responseKind" = 'NO_CAPTURE'
      AND "responseCardinality" = 'SINGLE'
      AND "responsePlacement" = 'BLOCK'
      AND "gradingMode" = 'SELF_REPORT'
      AND "validationLevel" = 'PRACTICE_ONLY'
    )
  );

ALTER TABLE "ExerciseResponseConfig"
  ADD CONSTRAINT "ExerciseResponseConfig_selection_range_check" CHECK (
    "minSelections" IS NULL OR "minSelections" >= 0
  ),
  ADD CONSTRAINT "ExerciseResponseConfig_selection_max_check" CHECK (
    "maxSelections" IS NULL OR "maxSelections" >= COALESCE("minSelections", 0)
  ),
  ADD CONSTRAINT "ExerciseResponseConfig_character_range_check" CHECK (
    "minCharacters" IS NULL OR "minCharacters" >= 0
  ),
  ADD CONSTRAINT "ExerciseResponseConfig_character_max_check" CHECK (
    "maxCharacters" IS NULL OR "maxCharacters" >= COALESCE("minCharacters", 0)
  ),
  ADD CONSTRAINT "ExerciseResponseConfig_word_range_check" CHECK (
    "minWords" IS NULL OR "minWords" >= 0
  ),
  ADD CONSTRAINT "ExerciseResponseConfig_word_max_check" CHECK (
    "maxWords" IS NULL OR "maxWords" >= COALESCE("minWords", 0)
  );

ALTER TABLE "ExerciseAttempt"
  ADD CONSTRAINT "ExerciseAttempt_context_xor_check" CHECK (
    num_nonnulls("dailyStudyPlanItemId", "assessmentSessionItemId") = 1
  ),
  ADD CONSTRAINT "ExerciseAttempt_context_kind_check" CHECK (
    ("dailyStudyPlanItemId" IS NOT NULL AND "contextKind" = 'STUDY')
    OR ("assessmentSessionItemId" IS NOT NULL AND "contextKind" = 'ASSESSMENT')
  ),
  ADD CONSTRAINT "ExerciseAttempt_score_range_check" CHECK (
    "maxScore" > 0 AND ("score" IS NULL OR ("score" >= 0 AND "score" <= "maxScore"))
  ),
  ADD CONSTRAINT "ExerciseAttempt_submission_time_check" CHECK (
    ("status" = 'SUBMITTED' AND "submittedAt" IS NOT NULL)
    OR ("status" <> 'SUBMITTED' AND "submittedAt" IS NULL)
  );

ALTER TABLE "AttemptTextResponse"
  ADD CONSTRAINT "AttemptTextResponse_crypto_metadata_check" CHECK (
    octet_length("ciphertext") > 0
    AND nullif(btrim("keyVersion"), '') IS NOT NULL
    AND nullif(btrim("purpose"), '') IS NOT NULL
    AND nullif(btrim("normalizedHash"), '') IS NOT NULL
  );

ALTER TABLE "ReviewEvent"
  ADD CONSTRAINT "ReviewEvent_rating_check" CHECK ("rating" BETWEEN 1 AND 4);
ALTER TABLE "ReviewStateSnapshot"
  ADD CONSTRAINT "ReviewStateSnapshot_phase_check" CHECK ("phase" IN ('BEFORE', 'AFTER'));

ALTER TABLE "ReadingActivity"
  ADD CONSTRAINT "ReadingActivity_progress_check" CHECK ("progress" BETWEEN 0 AND 1),
  ADD CONSTRAINT "ReadingActivity_offset_check" CHECK ("lastOffset" >= 0),
  ADD CONSTRAINT "ReadingActivity_completion_check" CHECK ("completedAt" IS NULL OR "progress" = 1);
ALTER TABLE "LexicalAnnotation"
  ADD CONSTRAINT "LexicalAnnotation_selector_range_check" CHECK (
    "startOffset" >= 0 AND "endOffset" > "startOffset" AND "confidence" BETWEEN 0 AND 1
  );

ALTER TABLE "BackgroundJob"
  ADD CONSTRAINT "BackgroundJob_attempt_range_check" CHECK (
    "attempt" >= 0 AND "maxAttempts" > 0 AND "attempt" <= "maxAttempts"
  ),
  ADD CONSTRAINT "BackgroundJob_lease_tuple_check" CHECK (
    num_nonnulls("leaseOwner", "leaseToken", "leaseExpiresAt") IN (0, 3)
  ),
  ADD CONSTRAINT "BackgroundJob_terminal_time_check" CHECK (
    ("status" IN ('SUCCEEDED', 'FAILED', 'CANCELLED') AND "completedAt" IS NOT NULL)
    OR ("status" NOT IN ('SUCCEEDED', 'FAILED', 'CANCELLED') AND "completedAt" IS NULL)
  );
ALTER TABLE "JobProgressEvent"
  ADD CONSTRAINT "JobProgressEvent_progress_check" CHECK (
    "sequence" >= 0 AND "processed" >= 0 AND ("total" IS NULL OR "total" >= "processed")
  );

ALTER TABLE "AuthSession"
  ADD CONSTRAINT "AuthSession_time_range_check" CHECK (
    "expiresAt" > "createdAt" AND "lastSeenAt" >= "createdAt"
  ),
  ADD CONSTRAINT "AuthSession_admin_strength_check" CHECK (
    "audience" <> 'ADMIN' OR "authStrength" = 'PASSWORD_MFA'
  ),
  ADD CONSTRAINT "AuthSession_revocation_reason_check" CHECK (
    ("revokedAt" IS NULL AND "revokeReason" IS NULL)
    OR ("revokedAt" IS NOT NULL AND nullif(btrim("revokeReason"), '') IS NOT NULL)
  );

ALTER TABLE "ContentRequirementEvaluation"
  ADD CONSTRAINT "ContentRequirementEvaluation_not_applicable_reason_check" CHECK (
    "status" <> 'NOT_APPLICABLE' OR nullif(btrim("reasonCode"), '') IS NOT NULL
  );

ALTER TABLE "PedagogicalMaterialBlock"
  ADD CONSTRAINT "PedagogicalMaterialBlock_payload_check" CHECK (
    num_nonnulls("text", "exampleId", "mediaAssetId") >= 1
  );
ALTER TABLE "AssessmentStimulusBlock"
  ADD CONSTRAINT "AssessmentStimulusBlock_payload_check" CHECK (
    num_nonnulls("text", "exampleId", "mediaAssetId", "materialRevisionId") >= 1
  );

ALTER TABLE "PedagogicalMaterialBlock"
  ADD CONSTRAINT "PedagogicalMaterialBlock_example_release_fkey"
    FOREIGN KEY ("releaseId", "exampleId") REFERENCES "ExampleSentence"("releaseId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "PedagogicalMaterialBlock_media_release_fkey"
    FOREIGN KEY ("releaseId", "mediaAssetId") REFERENCES "MediaAsset"("releaseId", "id") ON DELETE RESTRICT;
ALTER TABLE "AssessmentStimulusBlock"
  ADD CONSTRAINT "AssessmentStimulusBlock_example_release_fkey"
    FOREIGN KEY ("releaseId", "exampleId") REFERENCES "ExampleSentence"("releaseId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "AssessmentStimulusBlock_media_release_fkey"
    FOREIGN KEY ("releaseId", "mediaAssetId") REFERENCES "MediaAsset"("releaseId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "AssessmentStimulusBlock_material_release_fkey"
    FOREIGN KEY ("releaseId", "materialRevisionId") REFERENCES "PedagogicalMaterialRevision"("releaseId", "id") ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION sylis_target_exists(
  release_id uuid,
  target_kind text,
  target_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN CASE target_kind
    WHEN 'HEADWORD' THEN EXISTS (SELECT 1 FROM "HeadwordRevision" WHERE "releaseId" = release_id AND "headwordId" = target_id)
    WHEN 'ENTRY' THEN EXISTS (SELECT 1 FROM "LexicalEntryRevision" WHERE "releaseId" = release_id AND "entryId" = target_id)
    WHEN 'LEXICAL_ENTRY' THEN EXISTS (SELECT 1 FROM "LexicalEntryRevision" WHERE "releaseId" = release_id AND "entryId" = target_id)
    WHEN 'FORM' THEN EXISTS (SELECT 1 FROM "LexicalForm" WHERE "releaseId" = release_id AND "id" = target_id)
    WHEN 'LEXICAL_FORM' THEN EXISTS (SELECT 1 FROM "LexicalForm" WHERE "releaseId" = release_id AND "id" = target_id)
    WHEN 'FORM_REPRESENTATION' THEN EXISTS (SELECT 1 FROM "FormRepresentation" WHERE "releaseId" = release_id AND "id" = target_id)
    WHEN 'SENSE' THEN EXISTS (SELECT 1 FROM "LexicalSenseRevision" WHERE "releaseId" = release_id AND "senseId" = target_id)
    WHEN 'LEXICAL_SENSE' THEN EXISTS (SELECT 1 FROM "LexicalSenseRevision" WHERE "releaseId" = release_id AND "senseId" = target_id)
    WHEN 'CONCEPT' THEN EXISTS (SELECT 1 FROM "LexicalConceptRevision" WHERE "releaseId" = release_id AND "conceptId" = target_id)
    WHEN 'LEXICAL_CONCEPT' THEN EXISTS (SELECT 1 FROM "LexicalConceptRevision" WHERE "releaseId" = release_id AND "conceptId" = target_id)
    WHEN 'EXAMPLE' THEN EXISTS (SELECT 1 FROM "ExampleSentence" WHERE "releaseId" = release_id AND "id" = target_id)
    WHEN 'COLLOCATION' THEN EXISTS (SELECT 1 FROM "Collocation" WHERE "releaseId" = release_id AND "id" = target_id)
    WHEN 'MATERIAL' THEN EXISTS (SELECT 1 FROM "PedagogicalMaterialRevision" WHERE "releaseId" = release_id AND "id" = target_id)
    WHEN 'OBJECTIVE' THEN EXISTS (SELECT 1 FROM "LearningObjectiveRevision" WHERE "releaseId" = release_id AND "id" = target_id)
    WHEN 'STIMULUS' THEN EXISTS (SELECT 1 FROM "AssessmentStimulusRevision" WHERE "releaseId" = release_id AND "id" = target_id)
    ELSE false
  END;
END;
$$;

CREATE OR REPLACE FUNCTION sylis_validate_objective_contract() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  revision_id uuid;
  revision_release_id uuid;
  revision_status "RevisionStatus";
  primary_count integer;
  invalid_count integer;
BEGIN
  IF TG_TABLE_NAME = 'LearningObjectiveRevision' THEN
    revision_id := COALESCE(NEW.id, OLD.id);
  ELSE
    revision_id := COALESCE(NEW."objectiveRevisionId", OLD."objectiveRevisionId");
  END IF;
  SELECT "releaseId", status INTO revision_release_id, revision_status
  FROM "LearningObjectiveRevision" WHERE id = revision_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF revision_status = 'PUBLISHED' THEN
    SELECT count(*) FILTER (WHERE "subjectRole" = 'PRIMARY'),
           count(*) FILTER (WHERE NOT sylis_target_exists(revision_release_id, "targetKind", "targetId"))
      INTO primary_count, invalid_count
    FROM "LearningObjectiveSubject" WHERE "objectiveRevisionId" = revision_id;
    IF primary_count <> 1 OR invalid_count <> 0 THEN
      RAISE EXCEPTION 'Objective revision % requires exactly one valid PRIMARY release target', revision_id USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "LearningObjectiveRevision_contract"
AFTER INSERT OR UPDATE OR DELETE ON "LearningObjectiveRevision"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_objective_contract();
CREATE CONSTRAINT TRIGGER "LearningObjectiveSubject_contract"
AFTER INSERT OR UPDATE OR DELETE ON "LearningObjectiveSubject"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_objective_contract();

CREATE OR REPLACE FUNCTION sylis_validate_material_contract() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  revision_id uuid;
  revision_release_id uuid;
  revision_status "RevisionStatus";
  primary_count integer;
  invalid_count integer;
BEGIN
  IF TG_TABLE_NAME = 'PedagogicalMaterialRevision' THEN
    revision_id := COALESCE(NEW.id, OLD.id);
  ELSE
    revision_id := COALESCE(NEW."materialRevisionId", OLD."materialRevisionId");
  END IF;
  SELECT "releaseId", status INTO revision_release_id, revision_status
  FROM "PedagogicalMaterialRevision" WHERE id = revision_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF revision_status = 'PUBLISHED' THEN
    SELECT count(*) FILTER (WHERE "targetRole" = 'PRIMARY'),
           count(*) FILTER (WHERE NOT sylis_target_exists(revision_release_id, "targetKind", "targetId"))
      INTO primary_count, invalid_count
    FROM "PedagogicalMaterialTarget" WHERE "materialRevisionId" = revision_id;
    IF primary_count <> 1 OR invalid_count <> 0 THEN
      RAISE EXCEPTION 'Material revision % requires exactly one valid PRIMARY release target', revision_id USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "PedagogicalMaterialRevision_contract"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialRevision"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_material_contract();
CREATE CONSTRAINT TRIGGER "PedagogicalMaterialTarget_contract"
AFTER INSERT OR UPDATE OR DELETE ON "PedagogicalMaterialTarget"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_material_contract();

CREATE OR REPLACE FUNCTION sylis_validate_exercise_contract() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  revision_id uuid;
  revision_status "RevisionStatus";
  revision_kind "ExerciseResponseKind";
  config_count integer;
  config_kind "ExerciseResponseKind";
  reveal_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'ExerciseRevision' THEN
    revision_id := COALESCE(NEW.id, OLD.id);
  ELSE
    revision_id := COALESCE(NEW."exerciseRevisionId", OLD."exerciseRevisionId");
  END IF;
  SELECT status, "responseKind" INTO revision_status, revision_kind
  FROM "ExerciseRevision" WHERE id = revision_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF revision_status = 'PUBLISHED' THEN
    SELECT count(*), min("responseKind"), min("revealStimulusRevisionId")
      INTO config_count, config_kind, reveal_id
    FROM "ExerciseResponseConfig" WHERE "exerciseRevisionId" = revision_id;
    IF config_count <> 1 OR config_kind <> revision_kind THEN
      RAISE EXCEPTION 'Exercise revision % requires exactly one matching response config', revision_id USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "ExerciseRevision"
      WHERE id = revision_id AND "exerciseTaskKind" = 'SPOKEN_FORM_PRODUCTION' AND reveal_id IS NULL
    ) THEN
      RAISE EXCEPTION 'Spoken form production exercise % requires a reveal stimulus', revision_id USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ExerciseRevision_contract"
AFTER INSERT OR UPDATE OR DELETE ON "ExerciseRevision"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_exercise_contract();
CREATE CONSTRAINT TRIGGER "ExerciseResponseConfig_contract"
AFTER INSERT OR UPDATE OR DELETE ON "ExerciseResponseConfig"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_exercise_contract();

CREATE OR REPLACE FUNCTION sylis_validate_release_target() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  release_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'ContentProfileEvaluationTarget' THEN
    SELECT e."releaseId" INTO release_id FROM "ContentProfileEvaluation" e WHERE e.id = NEW."evaluationId";
  ELSIF TG_TABLE_NAME = 'CollectedLexicalItem' THEN
    release_id := NEW."releaseId";
  ELSIF TG_TABLE_NAME = 'LexicalAnnotation' THEN
    release_id := NEW."releaseId";
  ELSE
    RAISE EXCEPTION 'Unsupported target trigger table %', TG_TABLE_NAME;
  END IF;
  IF NOT sylis_target_exists(release_id, NEW."targetKind", NEW."targetId") THEN
    RAISE EXCEPTION '% target %:% is absent from release %', TG_TABLE_NAME, NEW."targetKind", NEW."targetId", release_id USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "ContentProfileEvaluationTarget_release_target"
AFTER INSERT OR UPDATE ON "ContentProfileEvaluationTarget"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_release_target();
CREATE CONSTRAINT TRIGGER "CollectedLexicalItem_release_target"
AFTER INSERT OR UPDATE ON "CollectedLexicalItem"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_release_target();
CREATE CONSTRAINT TRIGGER "LexicalAnnotation_release_target"
AFTER INSERT OR UPDATE ON "LexicalAnnotation"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_release_target();

CREATE OR REPLACE FUNCTION sylis_validate_exercise_stimulus_release() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  exercise_release_id uuid;
  stimulus_release_id uuid;
BEGIN
  SELECT "releaseId" INTO exercise_release_id FROM "ExerciseRevision" WHERE id = NEW."exerciseRevisionId";
  SELECT "releaseId" INTO stimulus_release_id FROM "AssessmentStimulusRevision" WHERE id = NEW."stimulusRevisionId";
  IF exercise_release_id IS DISTINCT FROM stimulus_release_id THEN
    RAISE EXCEPTION 'Exercise and stimulus revisions must belong to the same release' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "ExerciseStimulusRef_same_release"
AFTER INSERT OR UPDATE ON "ExerciseStimulusRef"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_exercise_stimulus_release();

CREATE OR REPLACE FUNCTION sylis_validate_choice_revision() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_revision_id uuid;
  actual_revision_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'ExerciseCorrectChoice' THEN
    expected_revision_id := NEW."exerciseRevisionId";
  ELSE
    SELECT "exerciseRevisionId" INTO expected_revision_id FROM "ExerciseAttempt" WHERE id = NEW."attemptId";
  END IF;
  SELECT "exerciseRevisionId" INTO actual_revision_id FROM "ExerciseChoice" WHERE id = NEW."choiceId";
  IF expected_revision_id IS DISTINCT FROM actual_revision_id THEN
    RAISE EXCEPTION 'Choice does not belong to the expected exercise revision' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'AttemptSelectedChoice' AND NOT EXISTS (
    SELECT 1 FROM "AttemptPresentedChoice"
    WHERE "attemptId" = NEW."attemptId" AND "choiceId" = NEW."choiceId"
  ) THEN
    RAISE EXCEPTION 'Selected choice was not presented for this attempt' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "ExerciseCorrectChoice_revision"
AFTER INSERT OR UPDATE ON "ExerciseCorrectChoice"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_choice_revision();
CREATE CONSTRAINT TRIGGER "AttemptPresentedChoice_revision"
AFTER INSERT OR UPDATE ON "AttemptPresentedChoice"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_choice_revision();
CREATE CONSTRAINT TRIGGER "AttemptSelectedChoice_revision"
AFTER INSERT OR UPDATE ON "AttemptSelectedChoice"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_choice_revision();

CREATE OR REPLACE FUNCTION sylis_validate_attempt_context() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_id uuid;
  expected_revision_id uuid;
BEGIN
  IF NEW."dailyStudyPlanItemId" IS NOT NULL THEN
    SELECT p."userId", i."objectiveRevisionId" INTO owner_id, expected_revision_id
    FROM "DailyStudyPlanItem" i JOIN "DailyStudyPlan" p ON p.id = i."planId"
    WHERE i.id = NEW."dailyStudyPlanItemId";
    IF owner_id IS DISTINCT FROM NEW."userId" THEN
      RAISE EXCEPTION 'Study attempt owner must match plan owner' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "ExerciseRevision" r
      WHERE r.id = NEW."exerciseRevisionId" AND r."learningObjectiveRevisionId" = expected_revision_id
    ) THEN
      RAISE EXCEPTION 'Study attempt exercise must match the plan objective revision' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT s."userId", i."exerciseRevisionId" INTO owner_id, expected_revision_id
    FROM "AssessmentSessionItem" i JOIN "AssessmentSession" s ON s.id = i."sessionId"
    WHERE i.id = NEW."assessmentSessionItemId";
    IF owner_id IS DISTINCT FROM NEW."userId" OR expected_revision_id IS DISTINCT FROM NEW."exerciseRevisionId" THEN
      RAISE EXCEPTION 'Assessment attempt must match the session owner and selected exercise' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "ExerciseAttempt_context"
AFTER INSERT OR UPDATE ON "ExerciseAttempt"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_attempt_context();

CREATE OR REPLACE FUNCTION sylis_validate_text_response_consent() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "ExerciseAttempt" a
    JOIN "ConsentRecord" c ON c.id = NEW."consentRecordId"
    WHERE a.id = NEW."attemptId"
      AND c."userId" = a."userId"
      AND c.purpose = 'PERSONALIZATION'
      AND c.decision = 'GRANTED'
  ) THEN
    RAISE EXCEPTION 'Captured response requires active owner consent' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "AttemptTextResponse_consent"
AFTER INSERT OR UPDATE ON "AttemptTextResponse"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_text_response_consent();

CREATE OR REPLACE FUNCTION sylis_validate_review_event() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "ExerciseAttempt" a
    JOIN "ExerciseRevision" e ON e.id = a."exerciseRevisionId"
    WHERE a.id = NEW."attemptId"
      AND a."userId" = NEW."userId"
      AND a."contextKind" = 'STUDY'
      AND a.status = 'SUBMITTED'
      AND e."learningObjectiveRevisionId" = NEW."objectiveRevisionId"
  ) THEN
    RAISE EXCEPTION 'Review event must derive from a submitted STUDY attempt for the same objective revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "ReviewEvent_source_attempt"
AFTER INSERT OR UPDATE ON "ReviewEvent"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_review_event();

CREATE OR REPLACE FUNCTION sylis_validate_review_snapshots() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  review_id uuid;
BEGIN
  review_id := CASE WHEN TG_TABLE_NAME = 'ReviewEvent' THEN COALESCE(NEW.id, OLD.id) ELSE COALESCE(NEW."reviewId", OLD."reviewId") END;
  IF EXISTS (SELECT 1 FROM "ReviewEvent" WHERE id = review_id)
     AND (SELECT count(*) FROM "ReviewStateSnapshot" WHERE "reviewId" = review_id) <> 2 THEN
    RAISE EXCEPTION 'Review event % requires exactly BEFORE and AFTER snapshots', review_id USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "ReviewEvent_snapshots"
AFTER INSERT OR UPDATE OR DELETE ON "ReviewEvent"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_review_snapshots();
CREATE CONSTRAINT TRIGGER "ReviewStateSnapshot_pair"
AFTER INSERT OR UPDATE OR DELETE ON "ReviewStateSnapshot"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_review_snapshots();

CREATE OR REPLACE FUNCTION sylis_validate_sense_hierarchy() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."parentSenseId" IS NULL THEN RETURN NEW; END IF;
  IF NEW."parentSenseId" = NEW."senseId" THEN
    RAISE EXCEPTION 'Sense cannot be its own parent' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "LexicalSenseRevision" p
    WHERE p."releaseId" = NEW."releaseId" AND p."senseId" = NEW."parentSenseId" AND p."entryId" = NEW."entryId"
  ) THEN
    RAISE EXCEPTION 'Parent sense must belong to the same release and entry' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors("senseId", "parentSenseId") AS (
      SELECT p."senseId", p."parentSenseId" FROM "LexicalSenseRevision" p
      WHERE p."releaseId" = NEW."releaseId" AND p."senseId" = NEW."parentSenseId"
      UNION ALL
      SELECT p."senseId", p."parentSenseId" FROM "LexicalSenseRevision" p
      JOIN ancestors a ON p."senseId" = a."parentSenseId"
      WHERE p."releaseId" = NEW."releaseId"
    )
    SELECT 1 FROM ancestors WHERE "senseId" = NEW."senseId"
  ) THEN
    RAISE EXCEPTION 'Sense hierarchy must be acyclic' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "LexicalSenseRevision_hierarchy"
AFTER INSERT OR UPDATE OF "parentSenseId", "entryId", "releaseId" ON "LexicalSenseRevision"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_sense_hierarchy();

CREATE OR REPLACE FUNCTION sylis_guard_auth_session() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS NULL THEN
    RAISE EXCEPTION 'Revoked sessions cannot be restored' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.audience <> NEW.audience OR OLD."userId" <> NEW."userId" OR OLD."tokenHash" <> NEW."tokenHash") THEN
    RAISE EXCEPTION 'Session identity and audience are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AuthSession_guard" BEFORE UPDATE ON "AuthSession"
FOR EACH ROW EXECUTE FUNCTION sylis_guard_auth_session();

CREATE OR REPLACE FUNCTION sylis_validate_active_operator_role() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."revokedAt" IS NULL AND (NEW."expiresAt" IS NULL OR NEW."expiresAt" > CURRENT_TIMESTAMP)
     AND NOT EXISTS (
       SELECT 1 FROM "MfaCredential" m
       WHERE m."userId" = NEW."userId" AND m.status = 'VERIFIED' AND m."revokedAt" IS NULL
     ) THEN
    RAISE EXCEPTION 'Active operator role requires a verified MFA credential' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "OperatorRoleAssignment_mfa"
AFTER INSERT OR UPDATE ON "OperatorRoleAssignment"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sylis_validate_active_operator_role();

CREATE OR REPLACE FUNCTION sylis_validate_approval_decision() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  approval "ApprovalRequest"%ROWTYPE;
BEGIN
  SELECT * INTO approval FROM "ApprovalRequest" WHERE id = NEW."requestId";
  IF approval."requesterId" = NEW."actorUserId" THEN
    RAISE EXCEPTION 'Approval requester and approver must differ' USING ERRCODE = '23514';
  END IF;
  IF approval.status <> 'PENDING' OR approval."expiresAt" <= NEW."decidedAt" THEN
    RAISE EXCEPTION 'Approval request is not pending and valid' USING ERRCODE = '23514';
  END IF;
  IF NEW."reauthenticatedAt" > NEW."decidedAt" OR NEW."reauthenticatedAt" < NEW."decidedAt" - INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'Approval requires recent MFA reauthentication' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "OperatorRoleAssignment" r
    JOIN "MfaCredential" m ON m."userId" = r."userId" AND m.status = 'VERIFIED' AND m."revokedAt" IS NULL
    WHERE r."userId" = NEW."actorUserId" AND r.role = approval."requiredRole"
      AND r."revokedAt" IS NULL AND (r."expiresAt" IS NULL OR r."expiresAt" > NEW."decidedAt")
  ) THEN
    RAISE EXCEPTION 'Approver lacks the required active role and verified MFA' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ApprovalDecision_policy" BEFORE INSERT ON "ApprovalDecision"
FOR EACH ROW EXECUTE FUNCTION sylis_validate_approval_decision();

CREATE OR REPLACE FUNCTION sylis_validate_release_activation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "LexiconRelease" r
    WHERE r.id = NEW."toReleaseId" AND r."lexiconId" = NEW."lexiconId" AND r.status = 'VALIDATED'
  ) THEN
    RAISE EXCEPTION 'Activation target must be a VALIDATED release of the same lexicon' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "LexiconReleaseSourceInput" i
    JOIN "SourceDatasetVersion" v ON v.id = i."sourceDatasetVersionId"
    JOIN "SourceRightsPolicy" p ON p.id = v."rightsPolicyId"
    WHERE i."releaseId" = NEW."toReleaseId"
      AND (
        NOT p."mayServe"
        OR EXISTS (
          SELECT 1 FROM "SourceRestriction" x
          WHERE x."rightsPolicyId" = p.id
            AND (x."datasetVersionId" IS NULL OR x."datasetVersionId" = v.id)
            AND x."effectiveAt" <= NEW."createdAt"
        )
      )
  ) THEN
    RAISE EXCEPTION 'Activation target has an active source-rights restriction' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "LexiconReleaseActivation_policy" BEFORE INSERT ON "LexiconReleaseActivation"
FOR EACH ROW EXECUTE FUNCTION sylis_validate_release_activation();

CREATE OR REPLACE FUNCTION sylis_guard_background_job() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Background jobs cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF OLD.status IN ('SUCCEEDED', 'FAILED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Terminal background jobs are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> NEW.status AND NOT (
    (OLD.status = 'QUEUED' AND NEW.status IN ('RUNNING', 'CANCELLED'))
    OR (OLD.status = 'RUNNING' AND NEW.status IN ('RETRY_SCHEDULED', 'PAUSED', 'SUCCEEDED', 'FAILED', 'CANCELLED'))
    OR (OLD.status = 'RETRY_SCHEDULED' AND NEW.status IN ('RUNNING', 'CANCELLED'))
    OR (OLD.status = 'PAUSED' AND NEW.status IN ('QUEUED', 'CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Illegal background job transition: % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "BackgroundJob_state_machine" BEFORE UPDATE OR DELETE ON "BackgroundJob"
FOR EACH ROW EXECUTE FUNCTION sylis_guard_background_job();

CREATE OR REPLACE FUNCTION sylis_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'AIUsageLedger', 'SecurityAuditEvent', 'DataAccessAuditEvent',
    'JobProgressEvent', 'JobCheckpoint', 'ApprovalDecision', 'ReviewDecision',
    'ReviewEvent', 'ReviewStateSnapshot', 'FSRSParameterSet'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER append_only_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION sylis_forbid_mutation()',
      table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION sylis_guard_outbox_payload() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR
     (to_jsonb(NEW) - ARRAY['publishedAt', 'publishAttempts', 'nextAttemptAt', 'lastErrorCode'])
       IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['publishedAt', 'publishAttempts', 'nextAttemptAt', 'lastErrorCode']) THEN
    RAISE EXCEPTION 'Outbox event facts are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "OutboxEvent_fact_guard" BEFORE UPDATE OR DELETE ON "OutboxEvent"
FOR EACH ROW EXECUTE FUNCTION sylis_guard_outbox_payload();

CREATE OR REPLACE FUNCTION sylis_guard_exercise_attempt() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Exercise attempts cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'PRESENTED' THEN
    RAISE EXCEPTION 'Terminal exercise attempts are immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.status NOT IN ('SUBMITTED', 'ABANDONED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Illegal exercise attempt transition' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'score', 'correct', 'submittedAt'])
       IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status', 'score', 'correct', 'submittedAt']) THEN
    RAISE EXCEPTION 'Exercise attempt identity and presentation facts are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ExerciseAttempt_state_machine" BEFORE UPDATE OR DELETE ON "ExerciseAttempt"
FOR EACH ROW EXECUTE FUNCTION sylis_guard_exercise_attempt();

CREATE OR REPLACE FUNCTION sylis_protect_published_revision() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'Published % rows are immutable', TG_TABLE_NAME USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'AssessmentBlueprintRevision', 'AssessmentStimulusRevision', 'ExerciseRevision',
    'LexicalEntryRevision', 'LexicalSenseRevision', 'LexicalConceptRevision',
    'LearningObjectiveRevision', 'PedagogicalMaterialRevision'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER published_revision_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION sylis_protect_published_revision()',
      table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION sylis_protect_validated_release_fact() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  fact_release_id uuid;
BEGIN
  fact_release_id := OLD."releaseId";
  IF EXISTS (
    SELECT 1 FROM "LexiconRelease" WHERE id = fact_release_id AND status IN ('VALIDATED', 'RETIRED')
  ) THEN
    RAISE EXCEPTION 'Facts in a validated release are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'releaseId' AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname NOT IN (
        'LexiconRelease', 'DailyStudyPlan', 'CollectedLexicalItem', 'LexicalAnnotation',
        'SavedReading', 'ImportJob', 'LexiconValidationRequest'
      )
  LOOP
    EXECUTE format(
      'CREATE TRIGGER validated_release_fact_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION sylis_protect_validated_release_fact()',
      table_name
    );
  END LOOP;
END;
$$;
