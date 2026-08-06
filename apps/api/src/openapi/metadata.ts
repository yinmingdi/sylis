export default async () => {
  const t = {
    ["../modules/ai-tutor/dto/ai-tutor.dto"]: await import(
      "../modules/ai-tutor/dto/ai-tutor.dto"
    ),
    ["../modules/exercises/dto/exercises.dto"]: await import(
      "../modules/exercises/dto/exercises.dto"
    ),
    ["../modules/notebooks/dto/notebooks.dto"]: await import(
      "../modules/notebooks/dto/notebooks.dto"
    ),
    ["../modules/operations/dto/operations.dto"]: await import(
      "../modules/operations/dto/operations.dto"
    ),
  };
  return {
    "@nestjs/swagger": {
      models: [
        [
          import("../modules/jobs/dto/job-control.dto"),
          {
            ResumeJobDto: {
              reason: { required: true, type: () => String, maxLength: 1000 },
            },
          },
        ],
        [
          import("../modules/ai-tutor/dto/ai-tutor.dto"),
          {
            CreateTutorSessionDto: {
              title: { required: false, type: () => String, maxLength: 100 },
            },
            TutorContextRefDto: {
              targetKind: { required: true, type: () => String },
              targetId: { required: true, type: () => String },
              releaseId: { required: false, type: () => String },
            },
            CreateTutorMessageDto: {
              content: { required: true, type: () => String, maxLength: 8000 },
              consentRecordId: { required: true, type: () => String },
              contextRefs: {
                required: true,
                type: () => [
                  t["../modules/ai-tutor/dto/ai-tutor.dto"].TutorContextRefDto,
                ],
              },
            },
            CreateGrammarDiagnosisDto: {
              text: { required: true, type: () => String, maxLength: 12000 },
              languageTag: { required: true, type: () => String },
              consentRecordId: { required: true, type: () => String },
            },
            CreateReadingGenerationDto: {
              difficulty: { required: true, type: () => String },
              consentRecordId: { required: true, type: () => String },
              constraints: { required: false, type: () => Object },
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
            },
            ConsentRecordDto: {
              purpose: { required: true, type: () => String, maxLength: 64 },
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
            DataExportDto: { scope: { required: true, type: () => Object } },
            AdminChallengeDto: {},
            AdminSessionDto: {},
          },
        ],
        [
          import("../modules/notebooks/dto/notebooks.dto"),
          {
            CreateNotebookDto: {
              title: { required: true, type: () => String, maxLength: 80 },
              description: {
                required: false,
                type: () => String,
                maxLength: 500,
              },
            },
            UpdateNotebookDto: {},
            LexicalTargetDto: {
              kind: { required: true, type: () => Object },
              id: { required: true, type: () => String },
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
          import("../modules/operations/dto/operations.dto"),
          {
            CompilerModelPolicyDto: {
              enabled: { required: true, type: () => Boolean },
              provider: { required: false, type: () => String },
              model: { required: false, type: () => String },
              promptVersion: { required: false, type: () => String },
              schemaVersion: { required: false, type: () => String },
              modelPolicyVersion: { required: false, type: () => String },
              concurrency: {
                required: false,
                type: () => Number,
                minimum: 1,
                maximum: 16,
              },
              inputUsdPerMillion: {
                required: false,
                type: () => String,
                maxLength: 32,
                pattern: "/^(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?$/",
              },
              outputUsdPerMillion: {
                required: false,
                type: () => String,
                maxLength: 32,
                pattern: "/^(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?$/",
              },
              cacheHitUsdPerMillion: {
                required: false,
                type: () => String,
                maxLength: 32,
                pattern: "/^(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?$/",
              },
            },
            CreateBuildRunDto: {
              manifestUri: { required: true, type: () => String },
              manifestHash: { required: true, type: () => String },
              compileProfile: { required: true, type: () => Object },
              budgetMicros: {
                required: true,
                type: () => Number,
                minimum: 0,
                maximum: 9007199254740991,
              },
              modelPolicy: {
                required: true,
                type: () =>
                  t["../modules/operations/dto/operations.dto"]
                    .CompilerModelPolicyDto,
              },
            },
            CreateImportJobDto: {
              artifactUri: { required: true, type: () => String },
              artifactHash: { required: true, type: () => String },
            },
            ApprovalReasonDto: {
              reason: { required: true, type: () => String, maxLength: 1000 },
            },
            ApprovalDecisionDto: {
              decision: { required: true, type: () => Object },
            },
            CreateSourceSynchronizationDto: {
              sourceKind: { required: true, type: () => String },
            },
            WithdrawRedditSourceDto: {},
            UpdateRuntimeAiControlDto: {
              enabled: { required: true, type: () => Boolean },
            },
            UserSupportQueryDto: {
              query: { required: false, type: () => String, maxLength: 320 },
              limit: {
                required: true,
                type: () => Object,
                default: 50,
                minimum: 1,
                maximum: 100,
              },
            },
            UpdateUserStatusDto: {
              status: { required: true, type: () => Object },
            },
            RevokeAdminSessionDto: {},
            RecordDeploymentDto: {
              version: { required: true, type: () => String },
              gitSha: { required: true, type: () => String },
              environment: { required: true, type: () => Object },
              imageDigests: { required: true, type: () => Object },
              buildProof: { required: true, type: () => Object },
              status: { required: true, type: () => Object },
            },
          },
        ],
        [
          import("../modules/reading/dto/reading.dto"),
          {
            ResolveSelectionDto: {
              text: { required: true, type: () => String },
            },
            RecordReadingActivityDto: {
              documentId: { required: true, type: () => String },
              revisionId: { required: false, type: () => String },
              eventKind: { required: true, type: () => String },
              progress: {
                required: false,
                type: () => Number,
                minimum: 0,
                maximum: 1,
              },
              offset: { required: false, type: () => Number, minimum: 0 },
            },
            SaveReadingDto: {
              documentId: { required: false, type: () => String },
              releaseId: { required: false, type: () => String },
              targetKind: { required: false, type: () => String },
              targetId: { required: false, type: () => String },
            },
          },
        ],
        [
          import("../modules/study/dto/study.dto"),
          {
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
      ],
      controllers: [
        [
          import("../modules/jobs/controllers/jobs.controller"),
          {
            JobsHttpController: { get: {}, cancel: {}, events: {} },
            AdminJobsController: { resume: {} },
          },
        ],
        [
          import("../modules/ai-tutor/controllers/ai-tutor.controller"),
          {
            AiTutorController: {
              createSession: {},
              messages: {},
              createMessage: {},
              grammar: {},
              diagnosis: {},
              usage: { type: [Object] },
              generate: {},
            },
          },
        ],
        [
          import("../modules/exercises/controllers/exercises.controller"),
          { ExercisesController: { create: {}, respond: {} } },
        ],
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
          { HealthController: { live: {}, ready: {} } },
        ],
        [
          import("../modules/identity/controllers/admin-identity.controller"),
          {
            AdminIdentityController: {
              challenge: {},
              login: {},
              session: {},
              beginReauthentication: {},
              reauthenticate: {},
              logout: {},
            },
          },
        ],
        [
          import("../modules/identity/controllers/identity.controller"),
          {
            IdentityController: {
              registrationChallenge: {},
              register: {},
              login: {},
              session: {},
              logout: {},
              me: {},
              updateMe: {},
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
          import("../modules/notebooks/controllers/notebooks.controller"),
          {
            NotebooksController: {
              create: {},
              get: { type: Object },
              update: {},
              remove: {},
              items: {},
              add: { type: Object },
              updateItem: { type: Object },
              removeItem: {},
            },
          },
        ],
        [
          import("../modules/operations/controllers/operations.controller"),
          {
            OperationsController: {
              dashboard: {},
              createBuild: {},
              createImport: {},
              validate: {},
              preview: {},
              request: {},
              decide: {},
              activate: {},
              jobs: {},
              synchronize: {},
              withdrawReddit: {},
              audit: {},
              runtimeAiControl: { type: Object },
              setRuntimeAiControl: {},
              users: {},
              adminSessions: {},
              setUserStatus: {},
              revokeAdminSession: {},
              deployments: {},
              recordDeployment: {},
            },
          },
        ],
        [
          import("../modules/reading/controllers/reading.controller"),
          {
            ReadingController: {
              document: {},
              annotations: {},
              resolve: {},
              activity: {},
              save: {},
              unsave: {},
            },
          },
        ],
        [
          import("../modules/reddit/controllers/reddit.controller"),
          { RedditController: { post: {} } },
        ],
        [
          import("../modules/study/controllers/study.controller"),
          {
            StudyController: {
              today: { type: Object },
              generateToday: {},
              objective: { type: Object },
              review: { type: Object },
              stats: {},
            },
          },
        ],
      ],
    },
  };
};
