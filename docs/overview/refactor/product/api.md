# API 契约

## 1. 三个公开接口

| App                       | Prefix          | Audience | Owner                                                                      |
| ------------------------- | --------------- | -------- | -------------------------------------------------------------------------- |
| `apps/backends/api`       | `/api/v1`       | USER     | Identity、Lexicon query、Learning、Exercise、Assessment、Notebook、Reading |
| `apps/backends/agent-api` | `/api/agent/v1` | AGENT    | Agent Session/Run/Event/Tool/Proposal/Artifact/Memory/usage                |
| `apps/backends/admin-api` | `/api/admin/v1` | ADMIN    | 运营、审核、Job、发布和审计                                                |

OpenAPI 3.1 是传输真相，`@sylis/api-client` 通过 `./user`、`./agent`、`./admin` 导出生成 client。DTO 不暴露 Prisma model、provider response、secret、checkpoint 或 Artifact 内部存储路径。

内部 app route 使用 `/internal/v1`、service grant 和独立 network policy，不与 browser route 共用 cookie/auth guard。

## 2. Identity 与 Grant

User session 使用 HttpOnly、Secure、SameSite cookie。`api` 独占注册、登录、MFA、session、Consent、AccessGrant、service grant 和 SupportGrant；Model Gateway 独占 Platform/BYOK `CredentialProfile/Revision`。User API 可以提供同源认证入口，但不持久化、缓存或回显 Provider secret。

| Method          | User path                                         | 行为                                                                          |
| --------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| POST            | `/auth/registration-challenges`                   | 创建短期验证 challenge                                                        |
| POST            | `/auth/register`                                  | 创建独立 User、Credential 与 USER session                                     |
| POST            | `/auth/sessions`                                  | 登录并设置 session cookie，不返回 bearer token                                |
| GET/DELETE      | `/auth/session`                                   | bootstrap 或撤销当前 session                                                  |
| POST            | `/auth/session/re-authentication`                 | 敏感操作前 re-auth 并轮换 CSRF                                                |
| GET/PATCH       | `/users/me`                                       | 当前 User projection/设置                                                     |
| GET/DELETE      | `/users/me/sessions/:id?`                         | 列表或撤销设备 session                                                        |
| GET/POST        | `/users/me/consents`、`/users/me/consent-records` | 有效 consent 与 append-only decision                                          |
| GET/POST/DELETE | `/users/me/model-credentials`                     | 代理 Gateway 的 masked metadata、创建/轮换/撤销 BYOK；创建后永不回显明文      |
| POST            | `/users/me/agent-grants`                          | 签发短期 AGENT audience AccessGrant cookie                                    |
| GET/POST/DELETE | `/users/me/support-grants/:id?`                   | 列出、创建或撤销绑定 SUPPORT Operator、精确资源 revision 与 expiry 的支持授权 |
| POST            | `/users/me/export-requests`                       | 创建异步导出                                                                  |
| POST            | `/users/me/deletion-requests`                     | 立即隐藏并启动 30 天 hard purge                                               |

普通只读 AccessGrant 可缓存 revocation 约 2 分钟；mutation、Admin、Proposal commit、release 和外部副作用每次在线检查 AuthSession/securityVersion。所有 browser mutation 校验 CSRF、Origin、Fetch Metadata 和 `Idempotency-Key`。

## 3. User API 资源

### Lexicon

| Method | Path                                   | 返回                                                          |
| ------ | -------------------------------------- | ------------------------------------------------------------- |
| GET    | `/lexicon/search?q=&cursor=`           | Headword/Entry/Form/multiword/collocation 分区与 match reason |
| GET    | `/lexicon/headwords/:id`               | Entry 集合、completeness 和材料摘要                           |
| GET    | `/lexicon/entries/:id`                 | Form、Sense、frame、morphology 和关系                         |
| GET    | `/lexicon/senses/:id`                  | 精确 Sense、example、collocation、relation 与 Concept         |
| GET    | `/lexicon/targets/:kind/:id/materials` | release-pinned PedagogicalMaterial                            |
| POST   | `/lexicon/translate`                   | 临时 TranslationResult，不写正式词典                          |

每个 Lexicon response 回显 `releaseId/releaseVersion` 并支持 ETag。请求开始时只解析一次 active release，整个 query chain 不混用版本。

### Learning、Exercise 与 Assessment

| Method     | Path                                                | 行为                                                       |
| ---------- | --------------------------------------------------- | ---------------------------------------------------------- |
| GET        | `/vocabulary-books`、`/:bookId/editions/:editionId` | stable book 与 immutable edition                           |
| POST/PATCH | `/study/enrollments`、`/:id`                        | enrollment 与 User 设置                                    |
| POST       | `/study/enrollments/:id/migrate`                    | 预览/确认 edition migration                                |
| GET        | `/study/today`                                      | 固定 DailyStudyPlan 与 Objective summaries                 |
| GET        | `/study/objectives/:id`                             | ObjectiveRevision、hint 和 eligible exercises              |
| POST       | `/study/attempts`                                   | 创建 PRESENTED attempt、固定 ExerciseRevision/choice order |
| POST       | `/study/attempts/:id/responses`                     | typed response 并服务端 grading                            |
| POST       | `/study/reviews`                                    | STUDY attempt -> ReviewEvent + FSRS transaction            |
| POST/GET   | `/assessments/sessions`、`/:id`                     | 固定 blueprint/release 的 session                          |
| POST       | `/assessments/sessions/:id/responses`               | 提交 typed response，不信任 client correctness             |
| POST/GET   | `/assessments/sessions/:id/submit`、`/result`       | immutable result 与 breakdown                              |

### Notebook 与 Reading

Notebook endpoint 使用 discriminated lexical target，数据库按 typed relation 强 FK；不接受任意 `targetType + targetId` 或 ownerId。

| Method          | Path                                       | 行为                                         |
| --------------- | ------------------------------------------ | -------------------------------------------- |
| CRUD            | `/notebooks`、`/:id/items`                 | User-owned collection、typed lexical target  |
| GET             | `/reading/documents/:id`                   | immutable revision、origin、rights、progress |
| GET             | `/reading/revisions/:id/annotations`       | 固定 release 的 typed annotations            |
| POST            | `/reading/revisions/:id/resolve-selection` | 解析 User 选择，不创建正式词典事实           |
| POST            | `/reading/activities`                      | append-only OPEN/PROGRESS/COMPLETE/LOOKUP    |
| GET/POST/DELETE | `/reading/saved`                           | User collection                              |
| GET             | `/explore/reddit/**`                       | 来源特有 experience projection               |

阅读材料生成不再使用 `/explore/ai-reading/generations`；Web 以 `reading.compose` Capability 调用 Agent API，结果是私人 AgentArtifact，发布到 Reading Core 时走 typed Proposal。

## 4. Agent API

| Method           | Path                                               | 行为                                                                                   |
| ---------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| GET/POST         | `/sessions`                                        | User-scoped session list/create                                                        |
| GET/PATCH/DELETE | `/sessions/:id`                                    | projection、archive/title、delete                                                      |
| GET              | `/sessions/:id/messages`                           | cursor messages + closed typed Block tree；正文按 owner 授权读取 Gateway content body  |
| POST             | `/sessions/:id/instructions`                       | 原子创建 Instruction/UserMessage/Root Run，返回 `instructionId/runId/eventCursor/run`  |
| GET              | `/sessions/:id/events`                             | Session SSE；新连接首帧 snapshot，重连按 `Last-Event-ID` 回放持久 AgentEvent           |
| GET              | `/sessions/:id/runs`                               | Root/ChildRun 与 wait/activation projection                                            |
| GET              | `/runs/:id`                                        | 精确 Run recovery/Admin-link projection；普通 UI 不循环调用                            |
| POST             | `/runs/:id/cancel`                                 | cancel 当前 Run，不改 terminal Run，返回更新后的 Run                                   |
| POST             | `/runs/:id/retry`                                  | User retry 创建并返回新的 Root Run                                                     |
| POST             | `/runs/:id/wait-conditions/:waitId/responses`      | 提供 User input/满足明确 wait                                                          |
| GET/POST         | `/proposals/:id`、`/:id/decisions`                 | 查看并 approve/reject 相同 action digest                                               |
| GET              | `/artifacts`、`/artifacts/:id`                     | User-owned Artifact/revision                                                           |
| POST             | `/artifacts/:id/revisions`                         | User 编辑产生新 immutable revision                                                     |
| POST             | `/artifacts/:id/accept-as-asset`                   | 显式接受 candidate，创建 immutable ContentAssetRevision                                |
| POST             | `/assets/upload-intents`                           | 创建短期 quarantine presigned upload intent                                            |
| POST             | `/assets/:id/finalize`                             | 校验 size/hash/MIME 并创建 processing Job                                              |
| GET/DELETE       | `/assets/:id`、`/assets/:id/revisions/:revisionId` | owner-scoped 状态/固定 revision/当前 revision 的 active processing Jobs/立即隐藏删除   |
| GET/POST         | `/diagnostic-bundles`                              | 从明确选择的引用创建自动脱敏 draft，User 预览后产生 immutable DiagnosticBundleRevision |
| POST             | `/diagnostic-bundles/:id/revisions`                | User 编辑/确认新 revision；Support 只能读取 grant 固定的 revision                      |
| DELETE           | `/model-exchanges/:id`                             | 撤回并立即隐藏 optional exchange，启动 30 天 purge                                     |
| GET/PATCH/DELETE | `/memory-cards/:id?`                               | 查看、更正、删除/抑制长期记忆                                                          |
| GET              | `/capabilities`                                    | 七个 Capability 与可用 provider/credential metadata                                    |
| GET              | `/usage`                                           | User quota/BYOK usage projection，不返回 key                                           |

每个新 Instruction 都立即拥有独立 Root Run。Session 已有执行槽 owner 时，新 Run 保持 `QUEUED` 且不创建 activation Job；前序 Run 终态后才调度最早候选。Run WAITING 通过 response/approval 后创建新 activation Job。Client 不直接 enqueue Job，也不能提交 model、prompt、tool grant 或 correctness 任意值。

```typescript
interface InstructionSubmission {
  instructionId: string;
  runId: string;
  eventCursor: number;
  run: AgentRunView;
  userMessage?: AgentMessageView;
}

type SessionStreamFrame =
  | {
      type: "SESSION_SNAPSHOT";
      cursor: number;
      session: AgentSessionView;
      messages: AgentMessageView[];
      runs: AgentRunView[];
    }
  | AgentStreamEvent;
```

`AgentMessageView.blocks` 是 closed discriminated union，并返回 stable block/parent/tree position/modelPosition/modelSubPosition、schema version、lifecycle 和 typed body/reference projection。`MESSAGE_STARTED` 固定本次 Root Run 的 assistant message id；`BLOCK_OPENED/BLOCK_DELTA_APPENDED/BLOCK_SEALED/BLOCK_INTERRUPTED` 只更新该 stable Block；`MESSAGE_COMPLETED/MESSAGE_INTERRUPTED` 携带完整公开 message projection；terminal Run event 携带状态、时间和安全错误码。浏览器用 `runId` 关联一次提交，不再通过“查询最新 Assistant 消息”猜归属。

新连接的 `SESSION_SNAPSHOT.cursor` 来自内部 Session `nextEventSequence`，必须是有限整数并与随后查询 PostgreSQL `AgentEvent` 使用的 cursor 完全相同；公开 `AgentSessionView` 不返回该内部序列。Controller 在发送 frame 和查询事件前校验 cursor，不能把 `NaN`、缺失值或 Redis payload 当作恢复位置。

Asset `finalize` 返回的 `jobId` 只代表 `ASSET_SCAN`。扫描成功后服务端按 MIME 创建 `ASSET_EXTRACT | ASSET_OCR`，之后创建 `ASSET_LEXICAL_INDEX`；浏览器对每个 Job 使用 `/api/v1/jobs/:jobId/events` SSE，Job terminal 时恰好读取一次 Asset projection 来取得下一批 `processingJobs` 或最终状态。正常链路没有 messages/runs/artifacts/proposals/Job/Asset 周期轮询。

### Executor ingress

`agent-executor` 使用 service grant 调用语义化 ingress：

```text
POST /internal/v1/agent-runs/:runId/message-block-fragments
POST /internal/v1/agent-runs/:runId/step-proposals
POST /internal/v1/agent-run-steps/:stepId/receipts
```

每个 Body 是独立的 `@sylis/agent-contracts` schema，不存在 generic action envelope。Block fragment 必须携带稳定 message/block identity、`modelPosition + modelSubPosition`、tree position、fragment sequence 和 Gateway opaque content ref；fragment idempotency key 固定为 `(invocationId, modelPosition, modelSubPosition, fragmentSequence)`，不能提交裸字符串或任意 JSON。完整 Step proposal 在任何副作用前一次 preflight，receipt 覆盖全部 accepted action 并按 modelPosition 排序。服务端校验 audience/scope、run/step/invocation、JobAttempt fencing token、CapabilityRelease、ToolGrant、schema、owner、action digest 和 idempotency；只有 Agent API 创建 `AgentRunStep`、`AgentToolCall`、`AgentMessageBlock` 和 `AgentEvent`。产品 write Proposal 获批后，Agent API 使用自己的 service grant 调用 User API typed internal command，不直接写 Learning/Reading/Notebook 表。

## 5. Model Gateway 内部 API

Model Gateway 不接受 browser cookie，也不提供 OpenAI-compatible 通用代理面：

| Method   | Path                                              | 行为                                                                        |
| -------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| POST     | `/internal/v1/model-execution-permits`            | 固定 caller/purpose/owner/route/credential/input digest/预算并 reservation  |
| POST     | `/internal/v1/model-invocations`                  | 原子消费一次性 permit，执行 typed generation/embed/vision operation         |
| GET      | `/internal/v1/model-invocations/:id`              | redacted status、usage、cost、latency 和错误分类                            |
| GET      | `/internal/v1/model-invocations/:id/events`       | normalized stream，禁止 raw Provider body/hidden reasoning                  |
| POST/GET | `/internal/v1/model-content-bodies`、`/:id`       | 幂等创建或按 owner-scoped service grant 读取单个加密正文                    |
| POST     | `/internal/v1/model-content-bodies/:id/fragments` | 按 model position/sub-position/sequence 追加加密 fragment；同键同 hash 幂等 |
| POST     | `/internal/v1/model-content-bodies/:id/seal`      | 固定最终 content hash 并禁止继续追加                                        |
| POST     | `/internal/v1/model-content-bodies/:id/hide`      | 立即隐藏并安排符合 retention 的 hard purge                                  |
| POST     | `/internal/v1/credential-profiles/:id/revisions`  | MFA/re-auth 授权后的 immutable credential rotation                          |
| POST     | `/internal/v1/credential-profiles/:id/revoke`     | 撤销并阻止新 permit；按安全策略终止受影响调用                               |

permit 是单次、短期、精确绑定的授权记录，调用还必须匹配 executor service grant；它不是用户 API Key。Exact route 和 credential revision 在 Run/Build/Eval/Asset request 创建时固定，Provider 故障不能静默 failover。

## 6. Admin API

Admin session 使用独立 cookie、ADMIN audience、password + verified WebAuthn/TOTP 与 re-auth。`ADMIN` 不是 role；每个 route 同时检查当前七角色集合、目标资源、状态、revision 和 command policy。

| 资源                                                   | 关键操作                                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `/overview`                                            | 一个 permission-scoped projection；section 可独立 `DEGRADED`，回显 `observedAt`                                  |
| `/source-datasets`、`/versions`、`/rights-policies`    | immutable dataset version、checksum/parser/validation/rights reference；创建受控 acquisition/validation Job      |
| `/source-datasets/versions/:id/rights-decisions`       | typed evidence URI/hash/kind、serve/build/export policy 和 removal impact；任一 allow 无依据即拒绝               |
| `/lexicon/build-runs`                                  | 创建 pilot/full BuildRun，固定 source/profile/route/credential/budget/digest；full 引用 pilot evidence           |
| `/lexicon/build-runs/:id/budget-approval-previews`     | 基于当前等待状态、forecast 与预算差额生成 action digest，不产生 Job                                              |
| `/lexicon/build-runs/:id/budget-approvals`             | 双角色、re-auth、reason、action digest 和幂等键批准预算，并创建 `BUDGET_RESUME` activation                       |
| `/reviews/batches`、`/reviews/candidates`              | typed queue、CandidateRevisionEvidence diff、服务端 evidence hash、risk sampling、approve/reject/WARN acceptance |
| `/lexicon/publish-runs`                                | 固定 Artifact 的 preflight、dry validation、start/resume、progress 与 report；成功创建未激活 release             |
| `/lexicon/releases`                                    | validation evidence、activation preview/request/command 与 rollback pointer                                      |
| `/agents/runs`                                         | redacted projection；按安全或预算原因终止非终态 Run，不能读取 Exchange、retry 或修改 goal                        |
| `/agents/releases`                                     | Capability/Skill draft、immutable Candidate、Eval/Judge、approval、staging/promotion/rollback/revoke evidence    |
| `/models/routes`                                       | Git-owned immutable route/eval/health projection 与 security revoke/restore；不存在在线 endpoint editor          |
| `/models/credentials`                                  | Platform secret submission、masked revision/health、normal rotation/revoke 与 emergency quarantine/restore       |
| `/models/budget-policies`、`/quota-policies`、`/usage` | versioned policy、append-only usage projection、reservation/settlement/cost/error                                |
| `/assets`                                              | quarantine/scan/parser/derivative/purge metadata 与 redacted failure；普通 route 不返回正文或 object URL         |
| `/jobs`                                                | Job/Attempt/progress/SSE；control 由 JobKindPolicy、领域角色和状态共同决定                                       |
| `/user-support/users`、`/support-grants`               | SUPPORT 的最小 User projection、会话撤销和 exact-resource SupportGrant；不能借此编辑用户事实                     |
| `/operator-roles`、`/user-security-locks`              | 固定七角色 grant/renew/revoke 与 SECURITY_ADMIN 用户安全锁定；禁止 self-change/last-admin removal                |
| `/audit/*`                                             | SECURITY_ADMIN 结构化查询、两级 retention、LegalHold 和异步签名 NDJSON.zst export                                |
| `/deployment-releases`                                 | 仅 GET application release evidence 与 GitHub/Railway link；browser API 不提供 deploy/rollback/write             |

SupportGrant access 使用 `SupportResourceKind` discriminated contract，只允许 ReadingDocumentRevision、ContentAssetRevision、CollectedLexicalItemRevision、ExerciseAttemptTextArtifact 和 DiagnosticBundleRevision。不存在接受任意 `resourceType + URL/table/id` 的通用读取代理，也不存在 account/document/AgentSession 通配。

跨 bounded context 的 Admin command 必须交给 transaction owner：Identity/User/SupportGrant 由 `api` internal interface 处理，Agent Run/Release 由 `agent-api` 处理，Provider route/credential/usage 由 `model-gateway` 处理。`admin-api` 负责 ADMIN audience、command authorization、orchestration 和 redacted projection，不直接更新其他 owner 的表。

DeploymentRelease 由 GitHub Actions 使用受限 service identity 调用 internal ingestion API；ProviderRouteRelease 和 Tool implementation/schema 同样由 Git + CI/Eval ingestion 发布。Admin browser 不持有 GitHub/Railway token，也不能冒充 CI source。

Production v0.0.1 的 policy quorum 为一个同时具备 command 所需角色的 Operator，approval 绑定 immutable revision/manifest/action digest。未来提高 quorum 只发布新 policyVersion，不在页面硬编码人数。

Admin 创建 BuildRun/PublishRun 只提交领域 request、Job activation 与 outbox；HTTP 不执行长任务。Lexicon Publisher 成功只得到 VALIDATED release，activation 始终是独立 command。

## 7. HTTP 一致性

- list/search 使用签名 opaque cursor，包含 release/query profile/sort tuple；默认 20、上限 100。
- GET 支持 ETag；mutation 使用 201/202/204/409/422，长任务返回领域 Run 与 event URL。
- RFC 9457 problem 至少区分 validation、authentication、authorization、conflict、rate limit、credential failure、wait required、not found 和 transient unavailable。
- 同 actor + operation + idempotency key + request hash 只产生一个事实；不同 hash 返回 409。
- SSE 禁用 proxy buffering，发送 heartbeat，事件不含 secret、完整 User 内容、checkpoint 或 provider raw body。
- Agent Session SSE 以 PostgreSQL cursor 为准，Redis 只唤醒；一个浏览器 tab 对同一 Session 最多一个 EventSource。正常发送链为一次 instruction POST 加既有 SSE，禁止轮询 messages/runs/artifacts/proposals。
- Job SSE 使用稳定 event sequence 和 `Last-Event-ID`，包含 stage、processed/total、throughput、ETA 或 `estimating`、warning、attempt、heartbeat 和 terminal result；heartbeat 不推进业务 sequence。User 只能观察自己的数据导出和 Asset processing Job，通用 cancel 仍只允许定义了取消状态收敛的数据导出 Job。
- 高风险 command body 只提交目标 revision、结构化 reason 和必要领域 input；actor/role/before state、policy result 与 canonical action digest 由服务端计算。
- 时间为 ISO 8601 UTC，User 日界线单独携带 IANA timezone；自然语言文本带 BCP 47 tag。

## 8. 验收

- 三个 OpenAPI snapshot 和 client subpath 无 drift，User/Admin/Agent audience 互相拒绝。
- Agent Executor 不能通过内部接口或数据库权限绕过 typed action/Proposal。
- POST `/messages` 和 generic `/actions` 均不存在；instruction、语义结果与事件创建职责可区分。
- BYOK failure problem 不触发 PLATFORM invocation/ledger。
- permit 不能重放或改变 route/credential/input digest；未 READY asset 不能作为 instruction context。
- Lexicon response 单 release，Attempt/Review/Assessment owner 与 correctness 不信任 client。
- Admin 无 exact-resource SupportGrant 看不到明文；SupportGrant 永不解锁 AgentSession、ModelExchange、BYOK、hidden reasoning、system prompt 或 Provider raw body。
- 七角色、组合角色、role expiry、self-change/last-admin protection 与 JobKindPolicy 覆盖 allow/deny contract。
- Deployment browser route 只读；CI/service ingestion、Provider/Agent owner command 和 Admin API 互相拒绝错误 audience。
- AuditEvent append-only、structured search、两级 retention、LegalHold、archive hash 与 24h AuditExport 通过 contract/integration tests。
