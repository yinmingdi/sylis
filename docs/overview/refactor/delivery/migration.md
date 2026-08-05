# 绿地迁移与删除

## 1. 迁移结论

当前没有需要保留的生产用户数据，因此采用一次性绿地切换：新结构在旧结构旁完成本地和 staging 验证，API/User Web/Admin/Worker/Compiler Runner 切到新 contract 后删除旧模型。整个过程不做双写、不提供旧 DTO 兼容层，也不把旧行机械复制为新事实。

首次产品发布版本固定为 `0.0.1`：

```text
feature/* -> develop -> release/0.0.1 -> main -> tag v0.0.1
```

词典内容使用独立版本，例如 `2026.08.04.1`。应用版本与词典 release 可以独立发布和回滚。

## 2. 旧模型到新模型

### 2.1 词典与来源

| 旧结构                                   | 新结构                                                       | 处理方式                                                                |
| ---------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `Word`                                   | `Headword`                                                   | 只作为拼写检索入口；按 language + NFC identity 重建，不复制 `star`      |
| `Lexeme`                                 | `LexicalEntry`                                               | 按 POS、同形词和来源证据重新 resolve；不能只依赖旧 `homographNo`        |
| `LexicalForm`                            | `LexicalForm` + `FormRepresentation` + `FormFeature`         | `writtenForm` 拆成 representation；`featureKey` 解析成受控 feature      |
| `FormPronunciation`                      | `FormRepresentation(PHONETIC)` + `FormMedia`                 | 只有可追溯 IPA/audio 才发布；region 转受控 tag                          |
| `LexicalSense`                           | recursive `LexicalSense`                                     | source sense key 变为 external ID/evidence；Sense 由合并器重新对齐      |
| `SenseGloss`                             | `SenseDefinition` 或 `SenseTranslationText`                  | 根据 language、内容类型和 target Sense 拆分；不把所有中文文本并入首义项 |
| `UsageExample`                           | `ExampleSentence` + `ExampleTranslation` + `SenseExample`    | 句子与翻译可复用；必须重新解析到具体 Sense                              |
| `ExampleCitation`                        | `ExampleCitation` + evidence                                 | 未验证的 exam/year 不升级为正式 citation                                |
| `Collocation`                            | `Collocation` + `SenseCollocation` + components/observations | 按归一文本去重并绑定 Sense；必要时拆为 Multiword Entry                  |
| `SemanticRelation`                       | `SenseRelation` 或 `ConceptRelation`                         | 按 relation domain/range 重判；空 target 留在 candidate，不进正式表     |
| `LexemeRelation`                         | `EntryRelation`、`WordFormation` 或 `InflectionGeneration`   | abbreviation、derivation、inflection 分开，不做通用 related-word 数组   |
| `Mnemonic`                               | `LearningObjectiveHint`                                      | 绑定 ObjectiveRevision；AI 助记明确 GENERATED，不冒充词源               |
| `WordMedia`                              | `MediaAsset` + `FormMedia`（未来可加 concept media link）    | 重新定位 owner、hash、rights 和 region；不再默认挂 Headword             |
| `WordContentCompleteness`                | release-scoped typed coverage                                | 按 profile 重算，不迁移旧 JSON 状态                                     |
| `LexiconSourceVersion/Record`            | `SourceDatasetVersion` / `SourceRecord`                      | 校验 checksum、source key 和 raw payload hash 后重建                    |
| `DictionaryImportRun`                    | `ProcessingRun` + release build audit                        | 旧运行日志不迁为正式内容                                                |
| `WordLexiconMetadata`                    | typed external identifier/frequency/book evidence            | 每个字段进入正确实体层级                                                |
| `WordEnrichment/VocabularyEnrichmentRun` | compiler candidate/run                                       | 删除线上 enrichment；需要的内容由 compiler 重新生成                     |

### 2.2 词书、学习、题库与测试

| 旧结构                                             | 新结构                                               | 处理方式                                                          |
| -------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| `Book`                                             | `VocabularyBook` + immutable `VocabularyBookEdition` | stable book 与一次具体书单分开                                    |
| `WordBook`                                         | `VocabularyBookItem`                                 | 重新 resolve 到 Headword/Multiword Entry 并保存顺序/evidence      |
| `UserBook`                                         | `UserBookEnrollment`                                 | 当前无用户，不迁移旧行                                            |
| `UserLearning`                                     | enrollment、plan、study state 各自所有               | 删除含糊 umbrella aggregate                                       |
| `UserWord`                                         | `UserObjectiveMemoryState`                           | 不从一个 Word 状态推导多个 Objective 状态；空数据从头创建         |
| `LearningLog`                                      | `DailyStudyPlan` + `DailyStudyPlanItem`              | 删除 word ID JSON 数组                                            |
| `DailyWordProgress`                                | `ExerciseAttempt` + `ReviewEvent` + snapshots        | 不迁移手写计数、旧答案或近似 SM-2 状态                            |
| `WordPracticeQuestion`                             | `ExerciseItem/Revision` candidate                    | 仅 source-backed 且 target、答案、选项、provenance 全部通过时复用 |
| `WordPracticeChoice`                               | `ExerciseChoice` + stable correct-choice reference   | `correctIndex` 永不迁移为正式答案                                 |
| `QuizQuestion/QuizChoiceQuestion/QuizChoiceOption` | 无直接映射                                           | 删除；旧逻辑缺稳定题干、精准 target 和可信选项                    |
| `VocabularyTest/Answer`                            | `AssessmentSession/ExerciseAttempt/Result`           | 当前无用户，旧记录删除，不伪造新 session/attempt                  |
| `VocabularyNotebook/CollectedWord`                 | `Notebook` + typed lexical target                    | 当前无用户；新收藏可引用 Headword/Entry/Sense/Collocation         |

### 2.3 身份、阅读、AI 与运维

| 旧结构/能力                      | 新结构/边界                                                                             | 处理方式                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 旧 `User` 混合认证和业务字段     | `User` + email/credential/session/consent 安全子表                                      | 当前无用户，从空库开始；新注册只创建一个 `User.id`，所有用户事实统一使用该 `userId` |
| JWT/localStorage 登录            | server-side `AuthSession` + HttpOnly same-origin cookie                                 | 删除长期浏览器 token 和兼容 middleware；Admin 使用独立 audience/session             |
| `Chat/Message`                   | `TutorSession/TutorMessage/TutorContextRef`                                             | 不迁移旧聊天；新正文加密、最小上下文、用量和访问审计                                |
| `Article` + `usedWords JSON`     | `ReadingDocument/Revision` + typed `LexicalAnnotation/ReadingTarget`                    | AI reading、Reddit 与未来来源共享 Reading Core，不共享 feed/source metadata         |
| Reddit snapshot/user interaction | Reddit experience metadata + immutable Reading revision + `ReadingActivity`             | 重新同步合法来源；来源删除/编辑/retention 产生显式状态                              |
| 同步 AI 生成请求                 | typed domain request + `BackgroundJob` + Worker + SSE + `ModelInvocation/AIUsageLedger` | request 事务创建领域行、Job 与 outbox；Worker 可恢复，terminal 状态不可变           |
| 混在产品 Web 的管理入口          | 独立 `apps/admin` + `/api/admin/v1` + fixed RBAC                                        | 不迁移隐藏管理员状态；角色从显式受审计 assignment 创建                              |
| 脚本/日志中的长任务状态          | `BackgroundJob` + checkpoint + outbox + audit                                           | 导入、生成、导出都有稳定进度和幂等恢复                                              |

这不是“只改词典”的迁移。`0.0.1` 同时重写身份、学习、阅读、AI、Admin 和运维契约；不存在旧 API/schema/UI 兼容层。各上下文可按纵向切片分别完成，但只有全部切片通过 staging 后才进行一次最终切换。

## 3. 明确删除清单

完成切换后删除：

- Prisma：`words.prisma`、`imports.prisma`、`quiz.prisma`、`vocabulary-test.prisma`、`leaning.prisma` 及对应旧 migration-only 运行依赖。
- API module：`words`、`quiz`、`vocabulary-test`、运行时 `vocabulary-enrichment` 和 `jobs/vocabulary-enricher`。
- Web：旧 word detail contract、旧 quiz pages/components、旧 vocabulary-test 答案模型。
- Package：整个 `packages/shared`；transport/artifact/Job/database/UI/纯函数分别迁到明确 owner，不建立替代聚合包。
- Service：`services/vocabulary-importer`，由 `services/lexicon-importer` 替换。
- Railway：旧 enricher service；旧 importer 在新 release 激活且验证后删除。

删除前必须用 `rg` 和 TypeScript/Prisma build 证明没有运行时引用；不能只删表后等待线上报错。

## 4. 固定实施顺序

本节的 Phase 0-7 是实现顺序和完成声明的唯一阶段划分。根据 [ADR 0011](../../adr/0011-phase-gated-greenfield-refactor.md)，阶段内连续完成代码、fixture 和测试准备，不以每个小改动后的局部测试作为完成证据；到阶段边界一次性运行 [测试与验收](./testing.md) 分配给该阶段的完整矩阵，修复任何失败后重跑整套。阶段门禁未全绿时不得进入下一阶段。

### Phase 0：冻结 contract

1. 确认本目录为唯一设计源，冻结 artifact schema major `sylis.lexicon-artifact/1`。
2. 固定受控词表、文本 profile、稳定 ID 和 release 规则。
3. 固定 pnpm + Nx project graph、tags、targets、package exports 和跨项目 allowlist。
4. 将旧长文改为入口指针，后续决策只改本目录。

### Phase 1：独立 compiler

1. 先创建 `packages/lexicon-contracts`，冻结 artifact v1 schema、类型、受控词表和纯验证器。
2. 创建 `packages/lexicon-compiler`，实现 ECDICT、Kaikki/Wiktextract、OEWN、有道制品 adapters。
3. 先实现无 AI 的 normalize、identity resolution、validation 和 streaming writer。
4. 再加入 DeepSeek typed candidates、缓存、预算、抽检和可恢复 checkpoint。
5. 本地生成 200 词 pilot JSON；不得连接 Railway 或生产 DB。

### Phase 2：持久化、Job contract、Runner 和 importer

1. 创建 `@sylis/database`，迁入全新的 release-scoped Prisma schema/migration/client；业务 repository 不进入该包。
2. 创建无 Nest/Prisma/Redis/provider 依赖的 `@sylis/background-jobs` contract 和状态机测试。
3. 创建 `services/lexicon-compiler-runner`，只 claim `LEXICON_BUILD`，装配 AI/source/storage/progress 并调用纯 compiler。
4. 创建 `services/lexicon-importer`，只依赖 contracts/background-jobs/database 并接受标准 JSON；不得依赖 compiler 或 AI。
5. 在本地空 PostgreSQL 执行 dry-run、COPY staging、DRAFT build、validate、activate、rollback。
6. 用同一 artifact 重复导入，证明幂等且不会复制实体；模拟 Runner/Importer crash，证明 checkpoint/lease takeover。

### Phase 3：Identity、User Web shell 与 Admin shell

1. 实现 User、UserEmail、PasswordCredential、MfaCredential/WebAuthn/TOTP、ConsentRecord、AuthSession 与 CSRF；先完成注册、登录、session revoke、MFA 和 consent 记录。
2. 建立 User Web `app/pages/modules/assets` 四入口 shell、generated client 和唯一 query cache；创建 `@sylis/components`，禁止离线答案同步和全局 server-state store。
3. 创建同目录语义的独立 `apps/admin`，实现 password + verified WebAuthn/TOTP 的 ADMIN audience session、独立 cookie/CSRF、固定 RBAC、re-auth 和双人审批骨架。
4. API 改为 Nest module-first；实现 PostgreSQL BackgroundJob/outbox/SSE adapter 和独立 Worker，Redis 只 wake；先用 shared contract 的无 AI Job 验证 lease takeover、checkpoint、drain、取消和审计。

### Phase 4：Lexicon、Learning 与 Assessment 纵向切片

按以下顺序实现，避免同时改完整产品：

1. active release resolver 和 lexicon repositories；
2. search/headword/entry/sense endpoints；
3. books/edition/enrollment；
4. LearningObjective、daily plan、FSRS review；
5. exercise delivery/scoring；
6. assessment blueprint/session/result；
7. notebook typed target；
8. 删除所有 GET 时 enrichment/write path。

每个切片都必须准备 OpenAPI contract、repository integration test 和无写入 GET test，再供 Web 使用；这些切片在 Phase 4 全部实现后统一执行 Phase 4 完整门禁，不把单个切片的局部通过当成阶段完成。

### Phase 5：Reading 与运行时 AI 纵向切片

1. ReadingDocument/Revision、annotation、activity、saved 与 typed targets；先用本地 fixture 内容完成闭环。
2. Reddit experience adapter 与来源撤回/编辑/retention 行为；通用组件不依赖 Reddit DTO。
3. Tutor session/message/context、GrammarDiagnosis、AIUsageLedger、`StructuredGenerationPort` 和 `StreamingGenerationPort`；provider 使用测试 double 后再接 DeepSeek。
4. AI Reading 的 `ReadingGeneration` 通过 `jobId` 关联 BackgroundJob，由 Worker 发布 validated revision；失败不得创建半成品。
5. 每个 API 切片同步完成 User Web 页面；不得增加临时 adapter 把新结构拍回旧 `Word`/`Article`/`Chat`。

### Phase 6：全产品 staging 演练

1. 从 release candidate commit 构建 artifact 和空 staging DB，导入 DRAFT 并显式激活。
2. 对 User Web/API/Admin/Worker/Compiler Runner 执行 identity、consent、RBAC、lexicon、study、assessment、reading、AI、SSE、build resume 和 retention 测试。
3. 演练应用 rollback、LexiconRelease pointer rollback、Job resume、ADMIN session revoke、source withdrawal 和 AI kill switch。
4. 记录 artifact hash、migration version、所有 image digest、Railway deployment ID、active release ID 和 smoke evidence。

### Phase 7：一次性切换

1. 从 `develop` 创建 `release/0.0.1`，只接收修复和版本文档。
2. PR 到 `main`，所有 required checks 通过后 merge。
3. Railway 从该 `main` merge SHA 构建 API/Web/Admin/Worker/Compiler Runner 容器，由 API pre-deploy 执行一次 migration，再验证所有长期服务 health/readiness。
4. 应用健康后，在受保护内容发布流程导入并显式激活已验证 lexicon release。
5. smoke test 通过后创建 `v0.0.1` tag，并把 release 修复合回 `develop`。

应用部署失败就回滚应用 deployment；词典内容失败就保持或切回旧 `activeReleaseId`。两者不得通过逐行改生产表回滚。

## 5. 本地 pilot 通过条件

代码推送前必须同时满足：

- 同一输入、配置、模型响应缓存和 commit 产生相同 artifact hash。
- `bank`、`run/runs/ran`、`broken`、递归 Sense、搭配、Frame 和 relation-level fixtures 全部正确。
- 200 词每个发布实体有 provenance，所有引用与 count 完整。
- 题目答案不使用 index，选项洗牌后仍正确。
- fresh DB 可从 migration + JSON 完整重建，并能切回上一 release。
- API GET 不写数据库，Web 不把缺失和不适用都显示为“暂无数据”。

## 6. 禁止的迁移捷径

- 不用旧 `Word.id` 作为新 Headword/Sense/LearningObjective 的共同 ID。
- 不把旧扁平中文释义全部绑定到第一个 Sense。
- 不用 POS + 数组下标作为跨 release 稳定 Sense identity。
- 不把过去式、过去分词和派生词全部建成独立 Entry，也不全部压成 Form。
- 不在生产 GET 请求中补全缺失内容。
- 不让 importer 下载原始来源、调用 AI 或自动激活 release。
- 不为赶进度恢复旧表双写；出现阻塞应修复新 contract 或 fixture。
