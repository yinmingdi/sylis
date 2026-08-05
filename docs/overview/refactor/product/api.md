# API 重构

## 1. Contract 边界

用户 API 固定前缀为 `/api/v1`，Admin API 固定前缀为 `/api/admin/v1`。下文用户端表格中的 path 均相对于 `/api/v1`；Admin 端点始终写出完整前缀。两套 API 使用不同 audience 的 opaque session，不提供长期 bearer JWT，也不把 Prisma model、provider response 或 artifact entity 直接作为 HTTP DTO。

OpenAPI 3.1 是唯一传输契约。CI 分别生成 `@sylis/api-client` 和 `@sylis/admin-api-client`；User Web 不得引用 Admin client，Admin Web 不得引用 User Web 的 cache、router 或 session helper。

## 2. Module 目标

```text
apps/api/src/modules/
  identity/         注册、登录、独立 User、opaque session、consent
  health/           liveness/readiness
  lexicon/          search、headword、entry、release-pinned queries
  books/            book/edition/enrollment
  study/            daily plan、objective、review、FSRS
  exercises/        read-only exercise delivery/scoring helpers
  assessments/      blueprint、session、response、results
  notebooks/        user collection with typed lexical targets
  reading/          Reading Core、annotation、activity、saved
  reddit/           Reddit experience adapter 与来源特有 projection
  ai-tutor/         tutor、grammar、reading generation；不写词典
  jobs/             BackgroundJob enqueue/query/cancel、SSE projection
  operations/       build/import/release/deployment/usage/audit commands
```

删除 `words`、旧 `quiz`、旧 `vocabulary-test` 和运行时 `vocabulary-enrichment` module。可复用的纯投影/校验逻辑迁入拥有它的新 module service。

当前每个 module、endpoint family 和跨 module 依赖的逐项去向见 [后端目录与 NestJS 模块边界](../implementation/backend-structure.md) 与 [当前代码到目标代码的重构映射](../implementation/workspace-refactor.md)。

业务 module 采用 NestJS module-first 结构，目录只在需要时创建：

```text
<module>/
  <module>.module.ts
  controllers/
  dto/
  services/
  repositories/
  entities/
  policies/
  events/
  index.ts
```

复杂 service 按用例拆分，repository 归业务 module。Nest provider 默认私有；跨 module 必须通过对方 Nest module 明确 export 的 token/interface 和 `index.ts` 公开入口，不 deep import service/repository，也不跨 repository 开事务。`AppModule` 只做 composition。完整目录、module ownership、允许/禁止依赖和测试以 [后端目录与 NestJS 模块边界](../implementation/backend-structure.md) 为准。

## 3. Identity、User 与 session

| Method | Path                              | 行为                                                        |
| ------ | --------------------------------- | ----------------------------------------------------------- |
| POST   | `/auth/registration-challenges`   | 创建短效验证 challenge；始终返回不泄露账号存在性的统一结果  |
| POST   | `/auth/register`                  | 消费 challenge，创建独立 User、凭据和首个 USER session      |
| POST   | `/auth/sessions`                  | 登录并设置 `__Host-sylis_session`；响应不返回 session token |
| GET    | `/auth/session`                   | bootstrap 当前 actor、session generation 和 CSRF token      |
| DELETE | `/auth/session`                   | 撤销当前 session 并清 cookie                                |
| POST   | `/auth/session/re-authentication` | 敏感操作前重新认证并轮换 session/CSRF                       |
| GET    | `/users/me`                       | 当前 User 的非敏感 projection                               |
| PATCH  | `/users/me`                       | 修改当前 User 的展示资料和 timezone                         |
| GET    | `/users/me/sessions`              | 列出设备 session，不返回 token/hash                         |
| DELETE | `/users/me/sessions/:sessionId`   | 撤销指定设备 session                                        |
| GET    | `/users/me/consents`              | 查看本人的有效 consent projection 与 append-only 历史       |
| POST   | `/users/me/consent-records`       | 本人给予或撤回明确 purpose/data-category 的 consent         |
| POST   | `/users/me/export-jobs`           | 创建异步导出 Job                                            |
| POST   | `/users/me/deletion-requests`     | 创建可审计删除请求                                          |

认证成功后服务端从 AuthSession 解析 `ActorContext { userId, roles, consentPolicyVersion }`，客户端不能提交或切换 owner ID，也不能声称 operator role。所有 mutation 必须通过 session-bound CSRF header、Origin 与 Fetch Metadata 校验。

Admin 认证不复用上述 User cookie，端点固定为：

| Method | Path                                           | 行为                                                  |
| ------ | ---------------------------------------------- | ----------------------------------------------------- |
| POST   | `/api/admin/v1/auth/challenges`                | 密码验证后创建一次性 MFA challenge                    |
| POST   | `/api/admin/v1/auth/sessions`                  | 验证 WebAuthn/TOTP，设置 `__Host-sylis_admin_session` |
| GET    | `/api/admin/v1/auth/session`                   | bootstrap actor/roles/re-auth window 与 CSRF token    |
| DELETE | `/api/admin/v1/auth/session`                   | 撤销 Admin session 并清 cookie                        |
| POST   | `/api/admin/v1/auth/session/re-authentication` | 密码 + MFA re-auth，并轮换 session/CSRF               |

ADMIN session 必须是 `PASSWORD_MFA`；User session、recovery-code-only 流程或未验证 factor 均不得访问 Admin API。角色、密码或 MFA generation 变化后旧 Admin session 立即失效。

## 4. Lexicon endpoints

| Method | Path                                | 返回                                                                    |
| ------ | ----------------------------------- | ----------------------------------------------------------------------- |
| GET    | `/lexicon/search?q=&cursor=&limit=` | Headword、Entry、multiword、collocation、frame 分区结果                 |
| GET    | `/lexicon/headwords/:id`            | Headword 下完整 Entry 集合、completeness 和 material kind/count 摘要    |
| GET    | `/lexicon/entries/:id`              | 单一 POS/同形词 Entry，forms/senses/frames/morphology/relations         |
| GET    | `/lexicon/entries/:id/materials`    | 当前 release 的 Entry-targeted PedagogicalMaterial，按 kind cursor 分页 |
| GET    | `/lexicon/senses/:id`               | 精确 Sense、递归 children、examples/collocations/relations/concept      |
| GET    | `/lexicon/senses/:id/materials`     | 当前 release 的 Sense-targeted PedagogicalMaterial，按 kind cursor 分页 |
| POST   | `/lexicon/translate`                | 临时 `TranslationResult`，不写词典                                      |

所有响应包含：

```typescript
interface ReleaseEnvelope<T> {
  releaseId: string;
  releaseVersion: string;
  data: T;
  completeness?: ContentProfileEvaluationDto;
  attribution?: ContentAttributionDto[];
}
```

请求开始时读取一次 active release，并传入整个 repository call chain；不得在嵌套查询中再次解析“当前 release”。

Material list DTO 只返回 immutable revision、typed primary/supporting targets、typed blocks、lexical mentions、允许公开的 citations 和 completeness。它不返回 prompt、provider response、candidate rationale 或模型 chain-of-thought。词典详情首响应只返回 material availability；正文端点按需加载，避免所有故事和文化内容进入首包。

## 5. Books 与 enrollment

| Method | Path                                            | 行为                                          |
| ------ | ----------------------------------------------- | --------------------------------------------- |
| GET    | `/vocabulary-books`                             | stable books + latest editions/coverage       |
| GET    | `/vocabulary-books/:bookId/editions/:editionId` | 不可变 item 顺序、release coverage            |
| POST   | `/study/enrollments`                            | 固定到 edition，设置每日计划                  |
| PATCH  | `/study/enrollments/:id`                        | 只改用户设置；edition migration 用专门 action |
| POST   | `/study/enrollments/:id/migrate`                | 预览/确认迁移到新 edition 并审计              |

旧 `/learning/add-book`、`current-book` 和 `Book.offlinedata/criteria` 不延续。

## 6. Study endpoints

| Method | Path                                   | 行为                                                                                                                      |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/study/today`                         | 固定 DailyStudyPlan + ObjectiveRevision summaries                                                                         |
| GET    | `/study/objectives/:objectiveId`       | 当前计划固定的 ObjectiveRevision、hints、eligible ExerciseRevisions；不返回正确答案                                       |
| POST   | `/study/attempts`                      | 按 plan item 选择 ExerciseRevision，创建 PRESENTED STUDY attempt 并固定 choice order                                      |
| POST   | `/study/attempts/:attemptId/responses` | 提交 CHOICE/SHORT_TEXT/EXTENDED_TEXT/NO_CAPTURE typed response；SELF_REPORT 与正文分开，服务端按 gradingMode 终结 attempt |
| POST   | `/study/reviews`                       | 对已 SUBMITTED 的 STUDY attempt 提交 FSRS rating，事务写 ReviewEvent、snapshots 和 memory state                           |
| GET    | `/study/stats`                         | 从 review events/attempts/plan 聚合，不读取旧 UserWord counters                                                           |

三个 POST 都支持 `Idempotency-Key`。创建 attempt 只接受 plan item 与客户端 capability，不接受客户端指定正确答案；response 只接受 attempt ID + typed response；review 只接受已评分 attempt ID + FSRS rating。同 key + user + operation 只产生一份事实，payload 不一致返回 conflict。

## 7. Assessment endpoints

| Method | Path                                  | 行为                                                                        |
| ------ | ------------------------------------- | --------------------------------------------------------------------------- |
| GET    | `/assessments/blueprints`             | 可用测试定义摘要                                                            |
| POST   | `/assessments/sessions`               | 从 blueprint revision 事务组卷，预建 PRESENTED attempts 并固定 choice order |
| GET    | `/assessments/sessions/:id`           | 返回未泄露正确答案的下一/全部题                                             |
| POST   | `/assessments/sessions/:id/responses` | 提交 attempt ID + typed response；服务端判分并终结 ASSESSMENT attempt       |
| POST   | `/assessments/sessions/:id/submit`    | 完成并生成版本化 result                                                     |
| GET    | `/assessments/sessions/:id/result`    | 结果、反馈、facet/direction/evidence breakdown 和允许展示的正确答案         |
| GET    | `/assessments/history`                | cursor pagination                                                           |

客户端不再回传 `answerWordId`、`correctIndex` 或由客户端计算的 `isCorrect`。

## 8. Notebook

收藏不再只能引用 Headword。`CollectedLexicalItem` 使用分类型 relation 表支持：

- Headword：以后再选择学习哪个 Entry/Sense；
- Entry：明确词性/同形词；
- Sense：阅读中具体义项；
- Collocation/Multiword Entry：固定短语。

API 用 discriminated union 投影，数据库不用无外键 polymorphic ID。

| Method | Path                                   | 行为                                                         |
| ------ | -------------------------------------- | ------------------------------------------------------------ |
| GET    | `/notebooks`                           | 当前 User 的 notebook cursor list                            |
| POST   | `/notebooks`                           | 创建 notebook；title 在本人范围内按 normalized key 唯一      |
| GET    | `/notebooks/:notebookId`               | notebook metadata 与 item summary                            |
| PATCH  | `/notebooks/:notebookId`               | 修改 title/description/order，不接受 ownerId                 |
| DELETE | `/notebooks/:notebookId`               | 删除容器和 membership；不删除 lexical fact 或学习事实        |
| GET    | `/notebooks/:notebookId/items`         | typed target cursor list，固定当前 release projection        |
| POST   | `/notebooks/:notebookId/items`         | 添加 `{ target: TypedLexicalTarget, note? }`，同 target 幂等 |
| PATCH  | `/notebooks/:notebookId/items/:itemId` | 修改用户 note/tags/order，不允许更换 target                  |
| DELETE | `/notebooks/:notebookId/items/:itemId` | 删除 membership                                              |

所有 endpoint 从 session 推导 userId 并验证 notebook owner；target 必须在请求固定的 LexiconRelease 中可服务。跨 release 无法解析时返回 typed unavailable projection，不能静默把 Sense 降级成 Headword。

## 9. Reading Core 与内容体验

| Method | Path                                               | 行为                                                         |
| ------ | -------------------------------------------------- | ------------------------------------------------------------ |
| GET    | `/reading/documents/:documentId`                   | 返回可用 immutable revision、origin/rights 与阅读 projection |
| GET    | `/reading/revisions/:revisionId/annotations`       | 固定 lexicon release 的 typed lexical annotations            |
| POST   | `/reading/revisions/:revisionId/resolve-selection` | 解析用户明确选中文本；不创建词典事实                         |
| POST   | `/reading/activities`                              | 记录 append-only OPEN/PROGRESS/COMPLETE/LOOKUP 事件          |
| GET    | `/reading/history`                                 | user-scoped cursor history                                   |
| GET    | `/reading/saved`                                   | user-scoped collection                                       |
| POST   | `/reading/saved`                                   | 收藏 stable document 或精确 lexical target                   |
| DELETE | `/reading/saved/:itemId`                           | 删除当前 User 的收藏                                         |
| GET    | `/explore/reddit/feed`                             | Reddit experience 的来源特有 feed/filter/cursor              |
| GET    | `/explore/reddit/posts/:externalId`                | 来源 metadata + 可用 ReadingDocumentRevision                 |
| GET    | `/explore/ai-reading`                              | 当前 User 的已发布 AI reading 列表                           |
| POST   | `/explore/ai-reading/generations`                  | 创建 ReadingGeneration + BackgroundJob，返回 202/job URL     |

ReadingDocumentRevision 一经发布不可变。外部内容被编辑、撤回或 rights/retention 到期时产生新同步事实并改变可见性，不能原地覆盖正文。通用 Reading DTO 不包含 subreddit 投票、provider prompt 或任意 `usedWords` JSON。

## 10. Tutor、Grammar 与长任务

| Method | Path                                     | 行为                                                          |
| ------ | ---------------------------------------- | ------------------------------------------------------------- |
| GET    | `/ai/tutor/sessions`                     | user-scoped 会话列表                                          |
| POST   | `/ai/tutor/sessions`                     | 创建 TutorSession                                             |
| GET    | `/ai/tutor/sessions/:sessionId/messages` | 解密授权后的 cursor projection                                |
| POST   | `/ai/tutor/sessions/:sessionId/messages` | 创建一次 invocation；返回 202 和 message stream URL           |
| POST   | `/ai/grammar-diagnoses`                  | 创建 GrammarDiagnosis + BackgroundJob，返回 202/job URL       |
| GET    | `/ai/grammar-diagnoses/:diagnosisId`     | observation/evidence/suggestion，不返回 provider raw body     |
| GET    | `/jobs/:jobId`                           | owner-scoped 状态、stage、processed/total、可恢复性与安全错误 |
| GET    | `/jobs/:jobId/events`                    | SSE；支持 `Last-Event-ID` 恢复                                |
| POST   | `/jobs/:jobId/cancel`                    | 仅可取消可取消状态；terminal Job 不变                         |
| GET    | `/ai/usage`                              | 当前 User 的 capability quota，不返回系统密钥或全局账本       |

客户端只能提交 typed `contextRefs`，服务端再做 owner、consent、release 和最小化投影校验。Tutor SSE 使用 `message.*` 事件；通用 Job SSE 使用 `job.*` 事件。每条事件有单调 sequence；重连只能恢复同一次 invocation，不能重复收费。

## 11. Admin API

`/api/admin/v1/**` 只接受 `audience=ADMIN` session。所有 command 在 application 层执行 RBAC；激活、回滚、来源移除、角色授予和 retention policy 变更还需要 re-auth、理由、impact digest 与第二人审批。

| 资源族                             | 关键操作                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `/build-runs`                      | 创建 pilot/full、预算预测/批准、resume、manifest/安全恢复摘要/SSE         |
| `/review-batches`                  | 风险分层队列、candidate/evidence diff、approve/reject、抽检 gate          |
| `/import-jobs`                     | dry-run/start/resume、stage/progress、validation report                   |
| `/lexicon-releases`                | 列表、validation/activation preview、activate、rollback                   |
| `/deployment-releases`             | commit/image/deployment/health/smoke projection；不代理 Railway secret    |
| `/ai-usage`                        | runtime/compiler 分账、reservation/settlement、告警与 provider projection |
| `/source-rights`                   | version、rights status、attribution、removal impact                       |
| `/support/users`                   | 最小 User 状态、session revoke、导出/删除请求状态                         |
| `/operator-role-assignments`       | grant/revoke；固定 role 且强制双人审批                                    |
| `/audit-events`                    | append-only cursor query；敏感正文不可作为普通列表字段                    |
| `/approvals/:approvalId/decisions` | 对同一 action digest 提交第二人决定                                       |

Admin 发起 build/import 不等于在 API request 内执行长任务。command 只创建 typed request、`BackgroundJob` 和 outbox；Compiler Runner 执行 `LEXICON_BUILD`，Importer 执行 `LEXICON_IMPORT/LEXICON_VALIDATE`，通用 Worker 不处理这三类 Job；API 只暴露状态与事件。

release command 使用明确资源端点：`POST /api/admin/v1/lexicon-releases/:id/validation-jobs`、`POST .../:id/activation-previews`、`POST .../:id/activation-requests` 和 `POST .../:id/rollback-requests`。`LexiconRelease.status` 只允许 `DRAFT -> VALIDATING -> VALIDATED -> RETIRED`；当前生效版本只由 `Lexicon.activeReleaseId` 表示，不能写 `ACTIVE` status。activation/rollback request 必须绑定 re-auth、理由、impact digest 和第二人审批。

## 12. Pagination 与搜索

- list/search 使用 opaque cursor，cursor 包含 release ID + sort tuple + query profile version 并签名。
- page size 默认 20、上限 100；不暴露 offset 扫描。
- search response 按类型分区并返回 match reason，不把 Form 命中伪装成独立 Headword。
- cursor release 不再可服务时返回明确 problem，客户端重新开始搜索。

## 13. HTTP consistency

- GET 支持 `ETag`/`If-None-Match`；ETag 包含 release/content hash。
- mutation 使用正确 201/202/204/409/422；长 import 不经 public API。
- timestamps ISO 8601 UTC；用户日界线单独使用 IANA timezone。
- `Content-Language` 和响应内 languageTag 语义一致。
- 不为内部 UUID 暴露递增 ID。
- mutation 默认要求 `Idempotency-Key`；同 actor + operation + key 的 payload hash 不一致返回 409。
- SSE 响应禁用 proxy buffering，并发送 heartbeat；事件中不得包含 secret、私人原文或 provider raw body。

## 14. Error contract

所有错误使用 RFC 9457：

```json
{
  "type": "https://sylis.example/problems/assessment-answer-invalid",
  "title": "Assessment answer is invalid",
  "status": 422,
  "detail": "The selected choice does not belong to this session item.",
  "instance": "/api/v1/assessments/sessions/session-id/responses",
  "code": "ASSESSMENT_CHOICE_NOT_IN_ITEM",
  "requestId": "request-id",
  "errors": []
}
```

生产错误不泄露 SQL、连接串、AI response 或 stack。

## 15. DTO、OpenAPI 与生成客户端

- OpenAPI 3.1 是 public contract；DTO schema 与 artifact schema 分开。
- CI 先生成并核对独立的 User/Admin OpenAPI 3.1 snapshot，再用 `openapi-typescript` 生成类型、用 `openapi-fetch` 建立 typed client。
- `packages/api-client` 只包含 `/api/v1`，`packages/admin-api-client` 只包含 `/api/admin/v1`；CI 用 import graph 阻止 User Web 引入 Admin client。
- 两个 client 只封装 base URL、credentials、CSRF、idempotency、RFC 9457 和 SSE transport，不包含 React hook、query key 或领域业务规则。
- 删除 `packages/shared`；transport type 归两套 generated client，artifact/Job/database/UI/通用函数分别归各自明确 package。前端禁止手写复制 OpenAPI DTO。
- API input 运行时验证；output contract test 验证 discriminated unions 和空数组语义。
- CI 生成 OpenAPI 并做 breaking-change check。

## 16. Repository pattern

controller 只做 HTTP/auth/DTO 边界；use-case service 管流程和 transaction；repository 接收显式 release/user scope。禁止 repository 内部读取全局 active release 或触发 enrichment。

```typescript
findEntryDetail(input: {
  releaseId: string;
  entryId: string;
  includeAttribution: boolean;
}): Promise<LexicalEntryDetail | null>;
```

查询使用 select/projection 避免全图 N+1；大型 nested relation 用批量 query/DataLoader 风格组装，并以真实 query plan 和 API latency budget 验收。
