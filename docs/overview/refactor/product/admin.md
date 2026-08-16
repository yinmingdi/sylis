# 独立 Admin 运营控制台

## 1. 产品边界

`apps/frontends/admin` 是独立 React/Vite 应用、Railway service 和域名。它是运营控制面与受限用户支持工具，不是能够绕过领域规则的 super-admin backend。

工程中保留以下三个不同概念：

- `ADMIN` 是 AuthSession audience；
- `Operator` 是通过 Admin 登录、执行运营职责的 User；
- `OperatorRole` 是可组合的固定职责集合。

Admin 与 User Web 不共享 cookie、CSRF token、route tree、QueryClient 或 bundle。Admin 只调用 `/api/admin/v1/**`；菜单和按钮只表达服务端返回的能力，权限真相始终位于 API command policy。所有未显式允许的 route、resource 和 command 默认拒绝。

普通 User session 不能升级或交换为 Admin session。Operator 必须在 Admin origin 依次验证密码和已登记的 WebAuthn/TOTP，取得独立 `__Host-sylis_admin_session`；完整认证、失效与 bootstrap 规则见[身份与独立用户](./identity-user.md)。

## 2. 信息架构

Admin 使用控制面分组，而不是按后端表名堆菜单。独立域名下的 route 固定为：

```text
/
/lexicon/sources
/lexicon/sources/:datasetId/versions/:versionId
/lexicon/rights
/lexicon/build-runs
/lexicon/build-runs/:runId
/lexicon/reviews
/lexicon/reviews/:queueKind/:itemId
/lexicon/publish-runs
/lexicon/publish-runs/:runId
/lexicon/releases
/lexicon/releases/:releaseId
/agent/runs
/agent/runs/:runId
/agent/releases
/agent/releases/:releaseId
/models/routes
/models/credentials
/models/usage
/assets
/assets/:assetId
/jobs
/jobs/:jobId
/users/support
/users/support/:requestKind/:requestId
/security/operators
/security/audit
/deployments
```

导航分组如下：

| 分组             | 页面                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| Overview         | 运营概览                                                                   |
| Lexicon          | Sources、Rights、Build Runs、Review Center、Publish Runs、Lexicon Releases |
| Agent & Models   | Agent Runs、Agent Releases、Model Routes、Credentials、AI Usage            |
| Assets & Jobs    | Assets、Jobs                                                               |
| Users & Security | User Support、Operator Roles、Audit                                        |
| Deployments      | 应用发布证据                                                               |

Overview 由一个 permission-scoped backend projection 返回当前 Operator 有权看到的阻断项、失败任务、待审核数量、预算风险和 application/Lexicon/Agent release。单个 owner service 不可用时对应 section 返回 `DEGRADED` 与 `observedAt`，不能伪装为零，也不应让整个 Overview 失败。

## 3. 页面职责

| 页面             | 主要能力                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sources          | 独立 Source Dataset Registry；查看 immutable SourceDatasetVersion 的 URI、checksum、acquired time、parser/version、validation、status 和 RightsDecision reference                          |
| Rights           | 用 LICENSE_TEXT/TERMS_OF_USE/OWNER_PERMISSION/LEGAL_REVIEW/POLICY_DOCUMENT URI + SHA-256 建立版本化 RightsDecision；缺失依据不能标记可 build/serve/export；source removal 先做影响分析     |
| Build Runs       | 显式创建 pilot/full BuildRun，固定 source/profile/route/credential/budget/code/schema revision 与 input digest；full build 必须引用成功 pilot evidence，先预览预算影响再由双角色批准并启动 |
| Review Center    | 统一展示 lexical fact、PedagogicalMaterial 和 Exercise candidate typed queues；按类型打开专用 inspector，不使用通用 JSON 编辑器                                                            |
| Publish Runs     | 固定一个 LexiconArtifact，执行 preflight、dry validation、publish/resume 和验证报告；成功只创建未激活 LexiconRelease                                                                       |
| Lexicon Releases | 查看 release evidence、activation impact；显式 activation/rollback 只改变 active pointer，不改写 release 或用户学习事实                                                                    |
| Agent Runs       | 只显示 redacted goal/status/capability/route/usage/error metadata；按安全或预算原因终止非终态 Run，不显示 Exchange、隐藏推理或 Provider raw body                                           |
| Agent Releases   | 编辑 Capability declaration/prompt 和 Skill Markdown draft；Candidate 后不可变，经过 validator、offline Eval、independent Judge、批准、staging 和同一 release 的 production promotion      |
| Model Routes     | 查看 Git + CI + Eval 发布的 immutable ProviderRouteRelease、health 和 evidence；不能在线编辑 endpoint、adapter、model schema 或 fallback                                                   |
| Credentials      | 安全提交 Platform secret 给 Model Gateway；以后只显示 profile/revision、masked hint、validation、health、rotation/quarantine/revoke audit                                                  |
| AI Usage         | runtime/build/eval/asset 分账、provider/model/route、reservation/settlement、schema failure、cost alert 和版本化 BudgetPolicy/QuotaPolicy                                                  |
| Assets           | metadata、quarantine/scan/parser/derivative/purge status、redacted failure 与 policy 允许的 retry/purge；普通列表不预览、下载或搜索用户文件正文                                            |
| Jobs             | 统一 Job/JobAttempt/progress projection；按钮完全由 JobKindPolicy 和 Operator 的领域角色决定，不编辑 payload/checkpoint                                                                    |
| User Support     | 最小账号/安全状态、session revoke、export/deletion request 与 SupportGrant；不能修改邮箱、密码、学习状态或 impersonate User                                                                |
| Operator Roles   | 固定角色的 grant/renew/revoke、有效期、MFA 状态和审计；不提供自定义 permission editor                                                                                                      |
| Audit            | SECURITY_ADMIN 的全局结构化查询、LegalHold、异步导出和 archive evidence；其他角色只在有权资源详情查看关联时间线                                                                            |
| Deployments      | 只读 commit、十二个 image digest、environment、health/smoke、GitHub workflow 与 Railway deployment link                                                                                    |

Review Center 的风险策略固定为：高风险、来源冲突和 answer-bearing candidate 100% 人工审核；低风险 candidate 按版本化 policy 做确定性抽样。抽样失败率超过 policy threshold 时整个 batch 失败。审核者可以修改未发布 Candidate，但每次保存都创建 immutable CandidateRevision，保留 before/after digest、evidence、editor 和 reason，重新运行 validator 并使旧 approval 失效。`WARN` 可由 `CONTENT_REVIEWER` 在近期 re-auth 后绑定精确 revision 接受；`ERROR` 永不可 override。

## 4. 固定 RBAC

| Role                    | 允许                                                                                  | 明确禁止                                                                |
| ----------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `SUPPORT`               | 最小 User projection、session revoke、export/deletion request、有效 SupportGrant 读取 | 锁定账号、改 email/password/学习状态、impersonation、读取 ModelExchange |
| `CONTENT_REVIEWER`      | Candidate revision、typed review、risk sample、`WARN` acceptance                      | Build/Publish、release activation、用户私人内容                         |
| `LEXICON_OPERATOR`      | SourceDatasetVersion、RightsDecision、BuildRun、PublishRun 与所属 Job                 | 激活 LexiconRelease、修改已发布事实                                     |
| `RELEASE_MANAGER`       | LexiconRelease activation/rollback 与 release evidence                                | 编辑 source/candidate、写 DeploymentRelease、授予角色                   |
| `MODEL_OPERATOR`        | Platform Credential 正常生命周期、BudgetPolicy/QuotaPolicy、usage/health              | 读取 secret、编辑 Git-owned ProviderRouteRelease、管理用户身份          |
| `AGENT_RELEASE_MANAGER` | Capability/Skill draft、Candidate、Eval/Judge approval、promotion/rollback            | 编辑 Tool implementation/schema、读取 User Exchange、直接写正式产品数据 |
| `SECURITY_ADMIN`        | audit、OperatorRole、用户安全锁定、LegalHold/retention、紧急 quarantine/revoke        | 作为万能业务角色、修改自身角色、删除审计、读取 secret                   |

角色可以组合，但组合描述同一 Operator 必须同时持有的职责，不等于多人审批：

- source removal 要求 `LEXICON_OPERATOR + RELEASE_MANAGER`；
- 提高单个 BuildRun 预算要求 `LEXICON_OPERATOR + MODEL_OPERATOR`；
- Platform Credential 的正常创建/轮换/验证由 `MODEL_OPERATOR` 执行；`SECURITY_ADMIN` 可单独紧急 `QUARANTINE`，恢复要求 `MODEL_OPERATOR + SECURITY_ADMIN`；
- Agent/Provider route 的 security revoke 可由 `SECURITY_ADMIN` 单独执行；恢复要求对应 release manager/operator 与 `SECURITY_ADMIN`；
- `MODEL_OPERATOR` 可因预算终止 Agent Run，`SECURITY_ADMIN` 可因安全事件终止；两者都不能 retry、改 goal 或查看 Exchange；
- Job control 还必须通过目标 JobKindPolicy 的 allowed cancel/retry/resume 状态转换；`UNKNOWN_OUTCOME` 只能 reconciliation。

v0.0.1 的高风险 command 允许一个同时具备所需角色的 Operator 完成。ApprovalPolicy 仍保存 `policyVersion`、`requiredQuorum`、eligible roles、action digest 和 approver decision；未来提高 quorum 通过新 policy version 实现，页面不得硬编码人数。

后续创建的 OperatorRoleAssignment 默认 90 天、最长 1 年，到期前显式续期。角色变化立即递增 security version、撤销该 User 的全部 ADMIN session 并清空 Admin client cache。

## 5. 高风险 command

以下 command 必须在线校验当前 session、当前角色、资源 revision/state 和 policy，并要求近期 password + MFA re-auth、结构化 reason、impact preview、action digest、幂等键和 SecurityAuditEvent：

1. 提高 BuildRun 预算或开始 full build；
2. 接受 validation `WARN`；
3. 激活或回滚 LexiconRelease；
4. source removal；
5. 使用 SupportGrant 读取私人原文；
6. grant/renew/revoke OperatorRoleAssignment；
7. 用户安全锁定、LegalHold 或 retention policy 变更；
8. Platform Credential rotation/revoke/quarantine/restore；
9. AgentRelease 或 ProviderRouteRelease security revoke/restore；
10. 创建 AuditExport。

客户端不能提交 `actorId`、`role`、before state、approval result 或 correctness。服务端根据已加载的精确 revision 计算 canonical action digest；资源或参数变化使已有 approval、preview 和 re-auth transaction authorization 失效。

## 6. SupportGrant

SupportGrant 只由 owner User 创建，固定一个 SUPPORT Operator、purpose、resource kind、resource id/revision、action digest、createdAt、expiresAt 和 revokedAt。默认有效 2 小时，User 可缩短，硬上限 24 小时，不自动续期。

首版 resource allowlist 为：

- `ReadingDocumentRevision`；
- `ContentAssetRevision`；
- `CollectedLexicalItemRevision`；
- `ExerciseAttemptTextArtifact`；
- User 预览、编辑并确认的 `DiagnosticBundleRevision`。

不允许 User/account/document/session 通配符。每次 grant 验证和明文读取都在线检查 owner、指定 Operator、expiry、revocation、resource revision 与 purpose，并创建 DataAccessAuditEvent。Assets 页面本身不解锁内容；指定 ContentAssetRevision 的检查发生在独立 support flow。

Agent 问题只使用 User 预览过的 DiagnosticBundleRevision。SupportGrant 永不解锁 AgentSession/AgentMessage 全量内容、ModelExchange、BYOK、hidden reasoning、system prompt、Provider raw body 或 Credential ciphertext。

SUPPORT 不能锁定账号。确认盗号或滥用风险时由 `SECURITY_ADMIN` 创建审计化 SecurityLock；解锁必须满足恢复 policy，不能用直接修改 `User.status` 代替安全流程。

## 7. Agent、模型与密钥边界

Agent API 拥有 Capability/Skill/Eval release 与 AgentRun；Model Gateway 拥有 ProviderRouteRelease、CredentialProfile/Revision、Invocation/Exchange 和 usage。Admin API 只通过 owner service 的 typed internal command/query interface 操作这些对象，不直接写其表。

Agent release 链为：

```text
Draft -> immutable Candidate -> deterministic validators
      -> offline Eval -> independent Judge -> Operator approval
      -> staging -> promote the same immutable release to production
```

Tool implementation/schema 与 ProviderRouteRelease 由 Git + CI + Eval 发布。Admin 只能查看 evidence、health 和安全撤销状态。普通 rollback 只影响新 Run；security revoke 同时终止引用该 release 的非终态 Run。

Platform secret 从 Admin form 经 Admin API 的不记录 body transport 直接交给 Model Gateway。Model Gateway 创建 immutable CredentialRevision 并 envelope-encrypt；响应只返回 masked metadata。Admin、日志、trace、problem detail、audit、export 和 browser telemetry 永不出现 key/ciphertext/KEK。Root KEK 只通过 Railway sealed variable 运维轮换，不进入 Admin。

DeploymentRelease 由 GitHub Actions 的受限 service identity 写入内部 ingestion API。Admin browser 只拥有 GET projection 和外部 workflow/deployment link，不保存 GitHub/Railway deploy token，也不提供 deploy/rollback command。

## 8. Audit 与留存

审计按目的分开保存，但通过统一 Audit Center projection 消费：

- `SecurityAuditEvent`：认证、授权失败、高风险 command、role/security/release/credential/retention 变化；
- `DataAccessAuditEvent`：SupportGrant 验证、私人资源读取和受控下载。

事件 append-only，至少包含 event/category/action、actor/session/role、target ref/revision、outcome、reason code、request/correlation/deployment ID、policy version、action/before/after digest、occurredAt 和最小 redacted metadata。密码、token、secret、Provider body、User 原文和任意 before/after payload 不进入事件。

全局 Audit Center 只允许 `SECURITY_ADMIN` 使用结构化条件查询：time range、category、action、outcome、Operator、role、target type/id、request/correlation/action digest 和 deployment ID。metadata 不建立全文索引。其他角色只能在已经有权访问的资源详情中读取该资源的 redacted timeline。

默认 RetentionPolicy：

| 类别                     | 在线查询 | 加密归档 | 总期限 |
| ------------------------ | -------- | -------- | ------ |
| Security/control-plane   | 2 年     | 5 年     | 7 年   |
| User data access/support | 1 年     | 1 年     | 2 年   |

Archive 由 automation-executor 生成加密、内容寻址、带 range manifest 和 SHA-256 的 system artifact；Railway Bucket 不宣称硬件 WORM，对象不可变性由 content-addressed key、writer role、hash verification 和禁止普通删除实现。只有 retention job 可在精确 policy 到期后清除。LegalHold 固定 event scope、reason/reference、creator、reviewAt 和 release decision，在有效期间阻止清理且自身被审计。

`SECURITY_ADMIN` 经 re-auth 和 reason 创建 `AUDIT_EXPORT` Job。Job 固定查询快照，输出 schema-versioned `NDJSON.zst`，记录 count、range 和 SHA-256；单对象 presigned download URL 24 小时后失效。创建 export、签发 URL 和下载均创建审计事件。

## 9. Job 进度与错误

BuildRun、PublishRun、Agent Eval、Asset processing、export、cleanup 和其他长任务使用统一 Job projection 与 SSE。UI 同时显示：

- stage 与稳定 progress event sequence；
- 真实 `processed/total`，无法预估时明确显示 `estimating`；
- throughput、ETA、warnings、当前 attempt 和最后 heartbeat；
- cancel/retry/resume policy、可恢复边界和 terminal result/report。

SSE 使用 `Last-Event-ID` 恢复，heartbeat 不推进业务 sequence；过期 cursor 返回稳定 problem code 并要求重新读取 snapshot。内部 payload、checkpoint、lease、fencing token、ciphertext 和 User/Provider body 不返回浏览器。

所有失败使用 RFC 9457 problem detail。Admin 只显示稳定 code、requestId、可安全展示的 detail 和 retryability；SQL、内部 host、connection string、secret 与私人正文不进入 toast 或 telemetry。

## 10. 前端模块边界

Admin module 固定为 `identity`、`overview`、`source-datasets`、`rights-decisions`、`build-runs`、`reviews`、`publish-runs`、`lexicon-releases`、`agent-runs`、`agent-releases`、`provider-routes`、`credentials`、`ai-usage`、`assets`、`jobs`、`user-support`、`operator-roles`、`audit` 和 `deployments`。

页面私有组件留在 `pages`；跨页面领域组件进入对应 module；无领域 primitive 只从 `@sylis/components` 消费；跨 runtime 纯函数才进入 `@sylis/utils`。Admin 只依赖从 Admin OpenAPI 3.1 snapshot 生成的 `@sylis/api-client/admin`。

TanStack Query 是唯一 server-state cache，key 至少包含 Operator userId、role/session generation、resource revision 和 filter。logout、role/session generation 变化或 MFA 失效时取消请求并清空整个 Admin QueryClient。URL 保存可分享筛选、选中资源和分页状态；Zustand 只允许保存未提交布局等纯客户端状态。

页面采用紧凑 list/detail 工作流和稳定尺寸的工具栏、表格、状态与进度控件。Review Center 可在桌面使用 master/detail inspector，但 detail 必须有可复制 URL；移动端只保证查看与安全阻断，不压缩复杂审核工作流。

## 11. Bootstrap 与恢复

系统没有默认 Admin 用户或默认密码。一次性离线 bootstrap 必须满足：

1. 数据库不存在任何 OperatorRoleAssignment；
2. 目标 User 已正常注册并完成至少一个 VERIFIED WebAuthn/TOTP；
3. 受保护命令在单事务中为该 User 显式创建七条长期 RoleAssignment、BootstrapState 和 SecurityAuditEvent；
4. 成功后 bootstrap 永久标记 consumed，删除一次性 Railway secret，重复执行失败。

Bootstrap 例外不受 90 天默认期限影响。线上 `SECURITY_ADMIN` 只能管理其他 Operator 的角色，不能修改自身角色或移除最后一个有效 SECURITY_ADMIN。

只有在不存在有效 SECURITY_ADMIN 时，受保护的离线 recovery command 才能为一个已完成 MFA 的 User 恢复一条 SECURITY_ADMIN assignment。Recovery 不能授予其他角色，必须记录 reason/operator/environment/action digest 和 SecurityAuditEvent，完成后轮换或删除 break-glass secret。

## 12. 验收

- ADMIN session 覆盖 password + WebAuthn、password + TOTP、challenge replay、role/MFA/password 变化后的即时撤销和 User cookie 混用拒绝。
- CSRF 覆盖 bootstrap、登录/re-auth 轮换、跨 origin、旧 token 和退出后重放。
- 七个 role、组合 role、resource state 和 JobKindPolicy 有 allow/deny contract tests；直接 API 与 UI capability projection 一致。
- 高风险 command 覆盖 re-auth、policy version、action digest、幂等、并发 revision conflict、单人 v0.0.1 quorum 和 audit。
- SupportGrant 覆盖指定 Operator、resource allowlist、exact revision、2h default/24h max、revoke/expiry、每次读取审计和所有永不解锁内容。
- Review 覆盖 immutable CandidateRevision、旧 approval 失效、100% high-risk、deterministic sample、batch failure threshold 和 ERROR non-override。
- Build/Publish/Activation 覆盖 pilot evidence、固定 input/route/credential/budget、publisher 不生成内容、VALIDATED 不自动 active 和 rollback pointer。
- Agent/Model 覆盖 Git-owned Tool/Route、secret non-disclosure、quarantine/restore role combination、security revoke 终止 Run 和普通 rollback 只影响新 Run。
- Audit 覆盖结构化查询权限、append-only/tamper evidence、两级 retention、LegalHold、archive hash 和 24 小时 AuditExport。
- SSE 覆盖刷新、断线、过期 cursor、重复事件、heartbeat 和 terminal reconnect。
- desktop/tablet 支持大表格、筛选、键盘、焦点和屏幕阅读器；移动端禁止误触高风险操作，所有文本无重叠和溢出。
