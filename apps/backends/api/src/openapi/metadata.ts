export default async () => {
  const t = {
    ["../modules/notebooks/dto/notebooks.dto"]: await import(
      "../modules/notebooks/dto/notebooks.dto"
    ),
    ["../modules/study/dto/study.dto"]: await import(
      "../modules/study/dto/study.dto"
    ),
    ["../modules/exercises/dto/exercises.dto"]: await import(
      "../modules/exercises/dto/exercises.dto"
    ),
    ["@sylis/job-contracts"]: await import("@sylis/job-contracts"),
  };
  return {
    "@nestjs/swagger": {
      models: [
        [
          import("../modules/notebooks/dto/notebooks.dto"),
          {
            CreateNotebookDto: {
              name: {
                required: true,
                type: () => String,
                minLength: 1,
                maxLength: 80,
                pattern: "/\\S/u",
              },
              description: {
                required: false,
                type: () => String,
                maxLength: 500,
              },
            },
            UpdateNotebookDto: {},
            LexicalTargetDto: {
              kind: { required: true, type: () => Object },
              id: { required: true, type: () => String, format: "uuid" },
            },
            AddNotebookItemDto: {
              target: {
                required: true,
                type: () =>
                  t["../modules/notebooks/dto/notebooks.dto"].LexicalTargetDto,
              },
              note: { required: false, type: () => String, maxLength: 2000 },
              tags: { required: false, type: () => [String] },
            },
            UpdateNotebookItemDto: {
              note: { required: false, type: () => String, maxLength: 2000 },
              tags: { required: false, type: () => [String] },
              position: { required: false, type: () => Number, minimum: 0 },
            },
          },
        ],
        [
          import("../modules/reading/dto/reading.dto"),
          {
            ResolveSelectionDto: {
              text: {
                required: true,
                type: () => String,
                minLength: 1,
                maxLength: 120,
              },
              revisionContentHash: {
                required: true,
                type: () => String,
                pattern: "/^sha256:[a-f0-9]{64}$/",
              },
              offsetUnit: { required: true, type: () => Object },
              startOffset: { required: true, type: () => Number, minimum: 0 },
              endOffset: { required: true, type: () => Number, minimum: 1 },
            },
            RecordReadingActivityDto: {
              documentId: { required: true, type: () => String },
              revisionId: { required: true, type: () => String },
              kind: { required: true, type: () => Object },
              progress: {
                required: false,
                type: () => Number,
                minimum: 0,
                maximum: 1,
              },
              position: { required: false, type: () => Number, minimum: 0 },
              learnedWordCount: {
                required: false,
                type: () => Number,
                minimum: 0,
              },
              totalReadSeconds: {
                required: false,
                type: () => Number,
                minimum: 0,
              },
            },
            SaveReadingCollectionItemDto: {
              documentId: { required: true, type: () => String },
              note: { required: false, type: () => String, maxLength: 2000 },
              thumbnailUrl: {
                required: false,
                type: () => String,
                maxLength: 4096,
              },
              tags: {
                required: false,
                type: () => [String],
                minLength: 1,
                maxLength: 40,
                uniqueItems: true,
                maxItems: 20,
              },
            },
          },
        ],
        [
          import("../modules/study/dto/study.dto"),
          {
            UpdateStudyProgressDto: {
              eventKind: {
                required: true,
                enum: t["../modules/study/dto/study.dto"]
                  .StudyProgressEventKind,
              },
              recognitionDecision: { required: false, type: () => Object },
              correct: { required: false, type: () => Boolean },
            },
            SubmitReviewDto: {
              attemptId: { required: true, type: () => String },
              rating: {
                required: true,
                type: () => Number,
                minimum: 1,
                maximum: 4,
              },
            },
          },
        ],
        [
          import("../modules/exercises/dto/exercises.dto"),
          {
            CreateStudyAttemptDto: {
              planItemId: {
                required: true,
                type: () => String,
                format: "uuid",
              },
            },
            SubmitExerciseResponseDto: {
              responseKind: { required: true, type: () => Object },
              choiceIds: {
                required: false,
                type: () => [String],
                format: "uuid",
                maxItems: 16,
              },
              text: { required: false, type: () => String, maxLength: 10000 },
              selfReported: { required: false, type: () => Boolean },
              revealAcknowledged: { required: false, type: () => Boolean },
              consentRecordId: {
                required: false,
                type: () => String,
                format: "uuid",
              },
            },
          },
        ],
        [
          import("../modules/assessments/dto/assessments.dto"),
          {
            CreateAssessmentSessionDto: {
              blueprintRevisionId: { required: true, type: () => String },
            },
            SubmitAssessmentResponseDto: {
              attemptId: { required: true, type: () => String },
              response: {
                required: true,
                type: () =>
                  t["../modules/exercises/dto/exercises.dto"]
                    .SubmitExerciseResponseDto,
              },
            },
            AssessmentHistoryQueryDto: {
              limit: {
                required: true,
                type: () => Object,
                default: 20,
                minimum: 1,
              },
            },
          },
        ],
        [
          import("../modules/books/dto/books.dto"),
          {
            BookEditionQueryDto: {
              after: {
                required: true,
                type: () => Object,
                default: -1,
                minimum: -1,
              },
              limit: {
                required: true,
                type: () => Object,
                default: 100,
                minimum: 1,
                maximum: 200,
              },
            },
            CreateEnrollmentDto: {
              bookId: { required: true, type: () => String, format: "uuid" },
              editionId: { required: true, type: () => String, format: "uuid" },
              dailyNewLimit: {
                required: true,
                type: () => Number,
                minimum: 1,
                maximum: 200,
              },
            },
            UpdateEnrollmentDto: {
              dailyNewLimit: {
                required: false,
                type: () => Number,
                minimum: 1,
                maximum: 200,
              },
            },
            MigrateEnrollmentDto: {
              editionId: { required: true, type: () => String, format: "uuid" },
              confirm: { required: true, type: () => Object, default: false },
            },
          },
        ],
        [
          import("../modules/identity/dto/identity.dto"),
          {
            RegistrationChallengeDto: {
              email: { required: true, type: () => String, format: "email" },
            },
            PasswordRecoveryChallengeDto: {},
            ResetPasswordDto: {
              token: {
                required: true,
                type: () => String,
                minLength: 40,
                maxLength: 2048,
              },
              password: {
                required: true,
                type: () => String,
                minLength: 12,
                maxLength: 128,
              },
            },
            RegisterDto: {
              token: {
                required: true,
                type: () => String,
                minLength: 40,
                maxLength: 2048,
              },
              password: {
                required: true,
                type: () => String,
                minLength: 12,
                maxLength: 128,
              },
              displayName: {
                required: true,
                type: () => String,
                minLength: 1,
                maxLength: 80,
              },
              timezone: {
                required: true,
                type: () => String,
                minLength: 2,
                maxLength: 35,
              },
            },
            LoginDto: {
              email: { required: true, type: () => String, format: "email" },
              password: {
                required: true,
                type: () => String,
                minLength: 1,
                maxLength: 128,
              },
            },
            UserReauthenticationDto: {
              password: {
                required: true,
                type: () => String,
                minLength: 1,
                maxLength: 128,
              },
            },
            ChangePasswordDto: {
              newPassword: {
                required: true,
                type: () => String,
                minLength: 12,
                maxLength: 128,
              },
            },
            UpdateUserDto: {
              timezone: {
                required: true,
                type: () => String,
                minLength: 2,
                maxLength: 35,
              },
              locale: {
                required: true,
                type: () => String,
                minLength: 2,
                maxLength: 35,
              },
              displayName: {
                required: false,
                type: () => String,
                minLength: 1,
                maxLength: 80,
              },
              email: { required: false, type: () => String, format: "email" },
              avatarUrl: {
                required: false,
                type: () => String,
                maxLength: 7000000,
              },
            },
            ConsentRecordDto: {
              purpose: { required: true, type: () => Object },
              categories: {
                required: true,
                type: () => [Object],
                minItems: 1,
                uniqueItems: true,
              },
              policyVersion: {
                required: true,
                type: () => String,
                maxLength: 64,
              },
              decision: { required: true, type: () => Object },
            },
            TotpCodeDto: {
              code: {
                required: true,
                type: () => String,
                minLength: 6,
                maxLength: 6,
              },
            },
            WebAuthnEnrollmentDto: {
              challengeId: {
                required: true,
                type: () => String,
                minLength: 36,
                maxLength: 36,
              },
              label: {
                required: true,
                type: () => String,
                minLength: 1,
                maxLength: 80,
              },
              response: { required: true, type: () => Object },
            },
            AdminMfaAssertionDto: {
              challengeToken: {
                required: true,
                type: () => String,
                minLength: 20,
                maxLength: 256,
              },
              method: { required: true, type: () => Object },
              code: { required: false, type: () => String },
              response: { required: false, type: () => Object },
            },
            DataExportDto: {
              scope: {
                required: true,
                enum: t["@sylis/job-contracts"].DataExportCategory,
                isArray: true,
                minItems: 1,
                uniqueItems: true,
              },
            },
            AdminChallengeDto: {},
            AdminSessionDto: {},
          },
        ],
        [
          import("../modules/jobs/dto/job-control.dto"),
          {
            ResumeJobDto: {
              reason: { required: true, type: () => String, maxLength: 1000 },
            },
          },
        ],
      ],
      controllers: [
        [
          import("../modules/lexicon/controllers/lexicon.controller"),
          {
            LexiconController: {
              search: {},
              headword: {},
              entry: {},
              entryMaterials: {},
              sense: {},
              senseMaterials: {},
              translate: {},
            },
          },
        ],
        [
          import("../modules/agent-operations/agent-operations.controller"),
          {
            AgentOperationsController: {
              executeTool: { type: Object },
              commitOwnerCommand: {},
              contextEvidence: {},
            },
          },
        ],
        [
          import("../modules/notebooks/controllers/notebooks.controller"),
          {
            NotebooksController: {
              create: {},
              get: { type: Object },
              update: {},
              remove: {},
              items: {},
              add: {},
              updateItem: {},
              removeItem: {},
            },
          },
        ],
        [
          import("../modules/reading/controllers/reading.controller"),
          {
            ReadingController: {
              document: {},
              annotations: {},
              targets: {},
              selectTargets: {},
              resolve: {},
              activity: {},
              history: {},
              save: {},
              unsave: {},
            },
          },
        ],
        [
          import("../modules/study/controllers/study.controller"),
          {
            StudyController: {
              today: { type: Object },
              objective: { type: Object },
              progress: {},
              review: { type: Object },
              stats: {},
            },
          },
        ],
        [
          import("../modules/jobs/controllers/jobs.controller"),
          {
            JobsHttpController: {
              get: { type: Object },
              cancel: {},
              events: {},
            },
          },
        ],
        [
          import("../modules/exercises/controllers/exercises.controller"),
          { ExercisesController: { create: {}, respond: {} } },
        ],
        [
          import("../modules/assessments/controllers/assessments.controller"),
          {
            AssessmentsController: {
              blueprints: {},
              create: {},
              session: {},
              respond: {},
              submit: {},
              result: {},
            },
          },
        ],
        [
          import("../modules/books/controllers/books.controller"),
          {
            BooksController: {
              list: {},
              edition: {},
              enroll: {},
              update: {},
              migrate: { type: Object },
            },
          },
        ],
        [
          import("../modules/health/health.controller"),
          {
            HealthController: {
              live: {},
              ready: { type: Object },
              deploymentReadiness: { type: Object },
            },
          },
        ],
        [
          import("../modules/identity/controllers/identity.controller"),
          {
            IdentityController: {
              registrationChallenge: {},
              passwordRecoveryChallenge: {},
              resetPassword: {},
              register: {},
              login: {},
              session: {},
              reauthenticate: {},
              logout: {},
              me: {},
              updateMe: {},
              changePassword: {},
              requestAccountDeletion: {},
              sessions: {},
              revokeSession: {},
              consents: {},
              createConsent: {},
              beginTotp: {},
              verifyTotp: {},
              beginWebAuthn: {},
              verifyWebAuthn: {},
              requestDataExport: {},
              dataExport: {},
            },
          },
        ],
        [
          import(
            "../modules/identity/controllers/internal-identity.controller"
          ),
          {
            InternalIdentityController: {
              challenge: {},
              session: { type: Object },
              validate: {},
              reauthenticationChallenge: {},
              reauthenticate: {},
              revoke: {},
              users: {},
              revokeUserSessions: {},
              operators: {},
              grantRole: {},
              revokeRole: {},
              lockUser: {},
            },
            InternalIdentityRetentionController: { purgeUser: {} },
          },
        ],
        [
          import(
            "../modules/identity/controllers/internal-support-grants.controller"
          ),
          { InternalSupportGrantsController: { access: {} } },
        ],
        [
          import(
            "../modules/identity/controllers/model-credentials.controller"
          ),
          {
            ModelCredentialsController: {
              list: { type: [Object] },
              create: { type: Object },
              rotate: { type: Object },
              revoke: { type: Object },
            },
          },
        ],
        [
          import("../modules/identity/controllers/support-grants.controller"),
          {
            SupportGrantsController: {
              list: {},
              preview: {},
              create: {},
              revoke: {},
            },
          },
        ],
        [
          import("../modules/reddit/controllers/reddit.controller"),
          { RedditController: { post: {} } },
        ],
      ],
    },
  };
};
