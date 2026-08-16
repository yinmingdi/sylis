# `0.0.1` 一次性重构顺序

## 1. 策略

当前没有生产 User，迁移直接建立最终 workspace、数据库和接口，不保留旧 DTO adapter、双 route、双 write、兼容 view 或长期 feature flag。实现按依赖顺序连续完成；所有结构落地后运行一次完整本地验收，再通过 protected `main` CI 和 staging 验证。

窄范围命令可以用于定位编译或测试问题，但不构成阶段完成声明。命令和应用使用正式职责名称，不再出现 `phase1`、`phase2` 等临时名称。

## 2. 先冻结契约

在改应用前固定：

- `sylis-lexicon-v1.json.zst` Schema、受控词表、200 词 fixture 和数据库映射；
- AgentSession/Run/Wait/Event/Tool/Proposal/Artifact/Memory/Capability contracts；
- ProviderRoute/Credential/Permit/Invocation/Exchange、ContentAsset/Revision 和 consent/retention contracts；
- Job/JobAttempt 状态、fencing、checkpoint 和 progress contracts；
- OpenAPI audience、AccessGrant/service grant、错误和幂等契约；
- Admin 七角色/组合 role expression、SupportGrant resource allowlist、JobKindPolicy、ApprovalPolicy、Audit retention/export 和一次性 bootstrap contract；
- Exercise 13 个 task kinds、四种 response kinds 和允许矩阵。

这些契约落入最终 package，不创建临时 `shared` 或 phase package。

## 3. 建立最终 workspace

一次性建立 `apps/frontends/*`、十个 `apps/backends/*`、12 个 packages 和 `tools/engineering-harness`；删除 `services/`、generic Worker、旧 runner/importer、`@sylis/model-runtime`、Nx、tsup/tsdown 和旧 package 聚合。同步 pnpm workspace、Turbo tasks、TypeScript references、ESLint import rules、Docker context 和正式命令名。

重命名完成前不新增依赖旧路径的新代码。app-to-app import 改为生成 client、contract 或内部 HTTP interface。

## 4. 重建数据库与权限

从空数据库创建最终 schema：Lexicon release 图、Learning/Exercise/Assessment、Reading、Notebook stable item + immutable revision、Identity/SupportGrant/七角色/bootstrap、Learning Agent/DiagnosticBundle、Model Execution/Credential/Exchange/Budget、Content Asset、Job/Attempt/JobKindPolicy、Outbox、Audit retention/archive/export 与 DeploymentRelease。表、enum、关系和普通索引只写入 Prisma Schema；Prisma 无法表达的 deferred constraint、append-only、permit claim、fencing、owner XOR 和跨表约束写入 `prisma/invariants.sql` 并测试。database installer 固定执行 Prisma force-reset 后再加载 invariants，不维护 migration history。

同时建立每个 backend app 的 PostgreSQL role。特别验证 Agent Executor 只能操作 Job/Attempt lease/progress，不能直接写 Agent 或产品表；Lexicon Publisher 不能修改 active pointer。

## 5. 完成 Identity 与同步接口

实现 `api` 的 User、email/password、MFA、AuthSession、Consent、AccessGrant、service grant、exact-resource SupportGrant、UserSecurityLock、OperatorRoleAssignment 与 bootstrap/recovery owner modules。然后实现 Learning、Lexicon query、Exercise、Assessment、Notebook revision 和 Reading owner modules。Provider credential 不进入 Identity。

建立 `admin-api` 的 ADMIN audience、deny-by-default 七角色/组合 policy、re-auth 和 Platform Operations owner modules：Overview、Source/Rights、Build/Review/Publish/Activation、Job、Audit 与只读 Deployment。通过 service grant + typed internal client 调用 `api` 的 Identity/Support、`agent-api` 的 Run/Release 和 `model-gateway` 的 Route/Credential/Usage；不跨 owner 直接写表。

实现一次性 offline bootstrap：只接受已注册且完成 VERIFIED MFA 的 User，在零 RoleAssignment 时原子创建七条长期 assignment、BootstrapState 和 audit，成功后永久禁用且不产生默认账号/密码。另建只在零有效 SECURITY_ADMIN 时可用、只能恢复 SECURITY_ADMIN 的受保护 recovery command。

从 `api` 删除全部 `/api/admin/v1` controller、ADMIN session orchestration 和 `operations` module；从手写 admin client 迁移到 Admin OpenAPI 3.1 生成的 `@sylis/api-client/admin`。

## 6. 完成 Learning Agent

先实现 `model-gateway` 的 ProviderRoute、CredentialProfile/Revision、一次性 permit、Invocation/Attempt/Exchange、usage、envelope encryption 和 fake-provider contract；Agent 执行只保留 framework-neutral `@sylis/agent-runtime`，并实现 `agent-api` 关系真相、SSE 和 `agent-executor` composition root：

1. 先用 fake model/tool adapter 证明 Run/Wait/Proposal/Artifact/Memory 和 Job activation。
2. 将 Gateway adapter 统一为 ordered content-block stream，覆盖 mixed text/tool、多 index 聚合、唯一 terminal frame，并保持 structured generation 的单 strict-result 契约。
3. 建立 durable `AgentRunStep`、独立 ToolCall identity、闭合 Step proposal/receipt 与 Agent API 整步 preflight。
4. 在 Runtime 内实现 parallel-safe rolling pool、exclusive barrier、逐调用失败/取消/unknown outcome、ordered commit 和 crash reconciliation；Executor 只装配 adapter 和 Job 生命周期。
5. 建立 `AgentMessage -> AgentMessageBlock` 的 closed typed tree、Gateway 加密 fragment、Runtime BlockAssembler、Agent API snapshot/SSE 与 Web reducer/renderer；历史 Block immutable，长内容固定 Artifact revision。
6. 实现 Root/ChildRun 数量、深度和 queue/preemption 规则，以及 public Web read 与 Sylis domain tools；v1 不添加 shell、任意 MCP、第三方 write 或 voice。
7. 实现 `asset-processor` 的 quarantine/scan/parse/OCR/index 和按需 vision/embedding，再接文件 API 与 revision-pinned context。
8. 实现 `agent-evaluator` 隔离的 offline Eval/Judge 与 release gate；最后在 Gateway 接 DeepSeek/OpenAI/Anthropic/Gemini adapter，真实调用仍不进入普通测试。

## 7. 完成 Lexicon 数据面

把来源解析、词形归并、Sense 对齐、AI candidate、验证和 JSON writer 收敛到 `@sylis/lexicon-compiler`。`lexicon-builder` 只做 source/model/storage/Job 装配；`lexicon-publisher` 只消费标准 Artifact、COPY staging、构建和验证 release。

先用 200 词固定 fixture 在空库反复 build/publish，证明 hash、引用、幂等、crash resume 和 rollback。代码和 fake 全量验证通过后，由 User 决定何时进行付费 DeepSeek pilot/full generation；自动化不得自行调用。

## 8. 完成后台自动化与前端

`automation-executor` 接管数据导出、来源同步和 retention purge，不承担 Agent、Asset、Eval 或 Lexicon build。每个 handler 注册正式 Job kind、幂等策略和 unknown side-effect reconciliation。

Web/Admin 迁入最终目录和生成 client。Web 删除孤立 Tutor/Grammar/AI Reading 页面，新增 `/agent`、`/agent/sessions/:id` 和 User-owned SupportGrant/DiagnosticBundle 流程，完成 desktop 三栏、mobile 全屏、上下文侧栏、typed MessageBlock timeline、Artifact/Approval inspector 和 snapshot + SSE 恢复。练习页面支持四种 v1 response renderer；未实现题型不显示入口。

Admin 一次性实现 Overview；Lexicon 的 Sources/Rights/Build Runs/Review Center/Publish Runs/Releases；Agent & Models；Assets & Jobs；User Support/Operator Roles/Audit；以及只读 Deployments。删除 `Imports`、独立 `Materials`、`Runtime AI` 和 browser deployment write。Job 页面只呈现 JobKindPolicy 允许的 control，所有长任务输出真实 processed/total、throughput、ETA 或 `estimating`。

## 9. 删除旧结构

删除清单包括：

- 旧 Word/Meaning/Chat/Article/Card/BackgroundJob 表和 repository；
- 旧 Tutor/Grammar/AI Reading route、store 和 DTO；
- User API 中的 Admin controller/operations module、旧 4-role enum、手写 admin client、`Imports`/`runtime-ai-control` route 和 browser DeploymentRelease write；
- `services/`、generic Worker、user-api/admin-web/compiler-runner/lexicon-importer 路径；
- `packages/shared`、旧 AI provider 聚合、旧 background-jobs/harness 命名；
- `develop`、`release/*`、Railway Git source autodeploy 和 phase-numbered commands；
- 旧 Railway service/config 和可被绕过的 deployment secret。

用架构检查、TypeScript project graph、Prisma schema/invariants 和 `rg` 证明没有运行时引用；不能只删除文件后等待 CI 报错。

## 10. 最终本地验收

所有实现工作完成后，从干净依赖和空数据库运行一次完整矩阵：

1. workspace/import/secret/schema/docs 静态门禁；
2. lint、typecheck、unit、property、integration 与全部 app build；
3. database install、constraints、七角色/组合权限/bootstrap、SupportGrant、Job fencing/Redis-loss、permit claim、encryption/rewrap/quarantine；
4. OpenAPI/client contract、API/Admin/Agent e2e；
5. Lexicon 200 词 fake pipeline、Artifact round-trip 和空库 publish/rollback；
6. Web/Admin desktop/mobile Playwright、Admin 全控制面、Agent SSE/approval/upload/consent/DiagnosticBundle、四类 Exercise renderer；
7. quarantine/ClamAV/file parser/deletion CAS、fake-provider streaming 和 evaluator release gate；
8. Docker build/start/health、image contents 和 no-secret scan。

任何失败修复后重跑受影响诊断，最终再重跑完整矩阵。完整门禁全部通过并 review diff 后，才允许合入 `main`；GitHub required checks 始终不能跳过。

## 11. Staging 与 production

green `main` 构建十二个不可变 GHCR digest 并自动部署隔离 staging。staging 从空库执行 Prisma schema + SQL-only invariants 安装、导入固定验证 Artifact，完成全产品 smoke 和权限检查。

维护者确认 staging evidence 后手工启动 protected release：创建 `v0.0.1` immutable tag/release，并将相同十二个 digest 提升到 production。production 不 rebuild，不自动运行付费模型，不自动构建或激活新 LexiconRelease。

## 12. 切换完成标准

- 代码、表、路由、任务和部署中不存在旧命名或兼容路径。
- 十二个 app、12 个 package 的依赖和数据库权限符合架构文档。
- 空库、固定 Artifact 和同一 commit 可重复得到同一 release/部署结果。
- Agent action、Job fencing、BYOK no-fallback、删除 30 天 purge 和 Admin redaction 有验证证据。
- staging 与 production 使用相同 digest；`v0.0.1` approval、manifest、smoke 和 rollback target 可审计。
