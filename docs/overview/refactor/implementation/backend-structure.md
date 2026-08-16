# 后端目录与模块边界

## 1. 总则

十个 backend 都在 `apps/backends`，且每个都是可独立部署产物。HTTP 应用采用 NestJS module-first；executor/processor 使用小型 composition root 和 `@sylis/job-runtime`。目录按真实实现创建，不建立空的 controller/service/repository 层。

Controller 只处理 transport/auth/DTO；application module 持有用例和事务；repository 留在拥有领域的 module。跨 module 使用公开 interface/token 或 outbox，禁止 deep import 实现。

## 2. `api`

```text
apps/backends/api/
  src/
    main.ts
    app.module.ts
    config/
    platform/
      auth/
      database/
      encryption/
      http/
      observability/
      outbox/
    modules/
      identity/
        controllers/
        dto/
        services/
        repositories/
        identity.module.ts
        index.ts
      grants/
      lexicon/
      books/
      learning/
      exercises/
      assessments/
      notebooks/
      reading/
      health/
  test/
    contracts/
    integration/
    e2e/
```

`identity` 独占 User、Password/MFA Credential 和 AuthSession；`grants` 是同一 Identity 上下文中的 AccessGrant/service grant/SupportGrant 用例。Provider Credential 由 Model Gateway 独占。`api` 提供 User audience 与受限内部 command interface，不执行模型 loop 或长任务。

## 3. `admin-api`

```text
apps/backends/admin-api/
  src/
    main.ts
    app.module.ts
    platform/{auth,database,http,observability}/
    integrations/{identity-api,agent-api,model-gateway}/
    modules/
      identity/
      overview/
      source-datasets/
      rights-decisions/
      build-runs/
      reviews/
      publish-runs/
      lexicon-releases/
      agent-runs/
      agent-releases/
      provider-routes/
      credentials/
      ai-usage/
      assets/
      jobs/
      user-support/
      operator-roles/
      deployments/
      audit/
      health/
  test/{contracts,integration,e2e}/
```

Admin API 使用独立 ADMIN audience、密码 + verified MFA re-auth、七种固定可组合角色、resource-state policy 和 deny-by-default command authorization。`ADMIN` 不是 role。它拥有 Platform Operations 的控制面 command/projection，但不拥有 Identity、Agent 或 Model Execution 的业务表。

`identity-api` adapter 调用 `api` 的 ADMIN session、SupportGrant、User request、session revoke、SecurityLock 和 OperatorRole internal interface；`agent-api` adapter 调用 AgentRun/Release query 与 command；`model-gateway` adapter 调用 ProviderRoute、Credential、usage 和 budget query/command。adapter 使用 service grant 和 typed contract，不导入其他 app 的源码、Prisma repository 或 browser DTO。

BuildRun、ReviewBatch、PublishRun、LexiconReleaseActivation、Job、Audit 与 DeploymentRelease 属于 Platform Operations，由 admin-api 的 owner module 提交 domain request、outbox 和 Job activation。CI 使用独立 token、模块内 Prisma provider 和 `sylis_ci_ingestor` role 写 internal DeploymentRelease ingestion；browser `/deployment-releases` 只有 GET，普通 `sylis_admin_api` 连接对该表只有 SELECT，不提供 deploy/rollback/write。

Platform secret body 只从受保护 controller 流经不记录 body 的 model-gateway adapter；admin-api 不持久化、缓存、审计或回显 secret。Support private content 只通过 exact-resource SupportGrant 的 typed owner query 返回，并在每次读取时写 DataAccessAuditEvent。

`v0.0.1` command policy 允许一个同时持有所需角色的 Operator；schema 保留 future quorum。所有高风险 command 固定 target revision、policyVersion 和服务端 canonical action digest。

## 4. `agent-api`

```text
apps/backends/agent-api/
  src/
    main.ts
    app.module.ts
    platform/
      auth/
      database/
      encryption/
      http/
      observability/
      outbox/
      sse/
    modules/
      sessions/
      runs/
      run-steps/
      plans/
      messages/
        blocks/
      events/
      tools/
      proposals/
      artifacts/
      memory/
      capabilities/
      releases/
      assets/
      health/
  test/{contracts,integration,e2e}/
```

`agent-api` 是 Agent 关系表和 `AgentEvent` 的唯一写入口。User browser 使用 `api` 签发的 AGENT audience AccessGrant；executor 使用 service grant。`messages/blocks` 拥有 closed Block union、tree/order/lifecycle invariant、body/reference owner 校验和 snapshot projection；可见 delta 使用带稳定 message/block identity、model position、fragment sequence 与 opaque content ref 的独立 typed ingress。模型 response terminal 后，Executor 提交一个闭合 `AgentStepProposal`。`run-steps` 模块在任何副作用前整步校验 Run/Invocation/fencing token、CapabilityRelease、ToolRelease、ToolGrant、schema、provider call identity、action digest、owner、预算、组合策略和内容大小，原子创建 Step/action/call/reference-block 事实并返回 `AgentStepExecutionPlan`。结果通过覆盖所有 accepted action 的 ordered `AgentStepReceipt` 提交，不提供 generic `/actions` 或通用 Block mutation endpoint。

当 Proposal 获准写入 Learning/Reading/Notebook 时，`agent-api` 调用 `api` 的 typed internal command；它不直接修改目标表。返回结果引用后，在同一 Agent 事务追加 Proposal result 和 AgentEvent。

## 5. `model-gateway`

```text
apps/backends/model-gateway/
  src/
    main.ts
    app.module.ts
    config/
    platform/{auth,database,encryption,http,observability}/
    modules/
      provider-routes/
      credentials/
      permits/
      invocations/
      exchanges/
      usage/
      provider-health/
    providers/
      deepseek/
      openai/
      anthropic/
      gemini/
    health/
  test/{contracts,integration,e2e}/
```

它是 ProviderRouteRelease、CredentialProfile/Revision、ModelExecutionPermit、Invocation/Exchange、usage 和 Provider adapter 的唯一 owner。它不运行 Agent loop，不解释 Agent control tool，不接受 browser cookie，不提供通用 OpenAI-compatible proxy，也不能写 Agent/产品表。所有调用消费一次性 permit；exact route/credential revision 固定且不静默 failover。Provider adapter 只输出 ordered content-block stream，并保证唯一 terminal frame。

## 6. `agent-executor`

```text
apps/backends/agent-executor/
  src/
    main.ts
    config/
    runtime/
      executor.ts
      graceful-shutdown.ts
    handlers/
      activate-agent-run.ts
    adapters/
      agent-step-port.ts
      model-gateway-port.ts
      public-web-tools.ts
      sylis-tools.ts
    health/
```

它只 claim Agent activation kinds，并作为 `@sylis/agent-runtime` 的部署 composition root。Executor 注入 Agent API Step port、Model Gateway Model port、受控 Tool port、并发配置与 `AbortSignal`；Runtime 内部按 modelPosition 执行 Agent API 返回的 plan，使用有界 rolling pool、exclusive barrier、逐调用 timeout/cancel/terminal result 和 ordered receipt。Executor 本身不拥有 Agent loop 或 scheduler policy，也不能创建 `AgentRunStep`、`AgentToolCall` 或 `AgentEvent`；它没有 User cookie、Provider key/SDK、正式领域 repository 或任意 SQL 写权限。Runtime 不依赖 NestJS、Cordis、数据库或 Provider SDK。v1 不装载本地 Connector、shell、任意 MCP、第三方 write 或 voice adapter；文件只通过 READY `ContentAssetRevision` 引用消费。

## 7. `agent-evaluator`

```text
apps/backends/agent-evaluator/
  src/
    main.ts
    config/
    runtime/
    handlers/
      evaluate-release.ts
      judge-evaluation.ts
    adapters/
      model-gateway-client.ts
      evaluation-storage.ts
    health/
```

Evaluator 在与 production Session 隔离的输入、预算和数据库权限下运行 offline Eval 与 independent Judge，输出 immutable evidence。它不能读取 production chat、激活 release 或修改 Candidate；promotion 仍由 Admin API 审批 command 完成。

## 8. `asset-processor`

```text
apps/backends/asset-processor/
  src/
    main.ts
    config/
    runtime/
    handlers/
      scan-asset.ts
      extract-document.ts
      run-ocr.ts
      build-lexical-index.ts
      build-embedding.ts
      analyze-image.ts
    adapters/
      quarantine-storage.ts
      clean-storage.ts
      clamav.ts
      model-gateway-client.ts
      vector-store.ts
    health/
```

Processor 只 claim 文件处理 Job。所有上传先进入 quarantine；malware/type/structure validation 通过后才能写 clean Bucket。OCR/index 可自动运行，vision/embedding 必须引用 User 请求、预算和 ModelExecutionPermit。解析器无网络、低权限且有 CPU/内存/时间限制。

## 9. `automation-executor`

```text
apps/backends/automation-executor/
  src/
    main.ts
    config/
    runtime/
    handlers/
      data-export.ts
      source-sync.ts
      retention-purge.ts
    adapters/
    health/
```

它处理非 Agent、非 Lexicon build 的后台 Job。每个 handler 由 Job kind 注册表静态绑定，有明确 idempotency 和 side-effect reconciliation；不能成为“什么都塞进去”的通用 Worker。

## 10. `lexicon-builder`

```text
apps/backends/lexicon-builder/
  src/
    main.ts
    config/
    runtime/
    handlers/build-lexicon.ts
    adapters/
      source-storage.ts
      artifact-storage.ts
      model-gateway-client.ts
    health/
```

Builder 是 `@sylis/lexicon-compiler` 的部署 composition root：固定 source manifest、模型策略、预算、checkpoint 和 Artifact upload。Compiler package 仍是纯模块，不连接 production DB 或 Railway。Builder 只产出候选 `sylis-lexicon-v1.json.zst` 和报告。

## 11. `lexicon-publisher`

```text
apps/backends/lexicon-publisher/
  src/
    main.ts
    config/
    runtime/
    handlers/
      publish-release.ts
      validate-release.ts
    adapters/
      artifact-storage.ts
      staging-writer.ts
    health/
```

Publisher 不依赖 compiler、Model Gateway 或 Provider SDK。它只流式读取标准 Artifact，执行 hash/schema/ref preflight、COPY staging、set-based release build 和全局 validation。成功结果是未激活 VALIDATED release；activation 只能由 Admin API 的独立 command 完成。

## 12. Job runtime interface

所有 executor 通过同一深模块使用执行协议：

```typescript
interface JobExecutor {
  claim(kinds: readonly JobKind[]): Promise<ClaimedAttempt | null>;
  heartbeat(attempt: ClaimedAttempt): Promise<void>;
  checkpoint(attempt: ClaimedAttempt, value: JobCheckpointInput): Promise<void>;
  progress(attempt: ClaimedAttempt, event: JobProgressInput): Promise<void>;
  finish(attempt: ClaimedAttempt, result: JobResult): Promise<void>;
}
```

调用者不接触 lease SQL、fencing CAS 或 Redis 实现。每个领域 handler 只接收 typed input、checkpoint 和 control。完整规则见 [Job 与执行协议](../architecture/background-jobs.md)。

## 13. 数据库角色

| App                   | 数据库权限                                                                           |
| --------------------- | ------------------------------------------------------------------------------------ |
| `api`                 | Identity/Learning/Reading owner tables + outbox；Agent/Lexicon 正式表只读 projection |
| `admin-api`           | 审核、审批、审计和发布 command tables；DeploymentRelease 只读；用户明文默认不可读    |
| `agent-api`           | Agent tables + outbox；产品表只读 projection                                         |
| `model-gateway`       | Model Execution/Credential/Exchange/usage owner tables；Agent/产品表禁止写           |
| `agent-executor`      | Job/Attempt lease 与 progress 所需最小权限；Agent/产品表禁止写                       |
| `agent-evaluator`     | EvalRun/Job/evidence；production Session 与 activation 禁止读写                      |
| `asset-processor`     | Asset processing/derivative、Job 和 pgvector projection；Agent/产品正文禁止写        |
| `automation-executor` | 自己 Job kinds 与明确 handler 所需表                                                 |
| `lexicon-builder`     | BuildRun/Job/progress metadata；正式 Lexicon 表禁止写                                |
| `lexicon-publisher`   | staging、release build/validation；active pointer 禁止写                             |

`sylis_ci_ingestor` 是 GitHub Actions release ingestion 的额外执行角色，不是第十一个 backend app role。它只拥有 `DeploymentRelease SELECT/INSERT` 与 `SecurityAuditEvent INSERT`，不拥有 UPDATE/DELETE 或其他 Platform Operations 表权限；deferred audit closure trigger 以受控 definer 读取审计行。

应用层规则和 PostgreSQL role 双重强制，避免一次错误 import 变成越权写入。

## 14. 配置与密钥

每个 app 只校验自己需要的环境变量。Platform Provider key、Credential KEK、Model Content KEK 和 BYOK 解密只进入 Model Gateway；Executor/Builder/Evaluator/Processor 只持有 service identity 和短期 permit。API 缺少模型 key 仍可启动并提供非 AI 功能。

Railway sealed variables 按环境分别保存 `CREDENTIAL_KEK_*`、`CREDENTIAL_INDEX_KEY_*` 与 `MODEL_CONTENT_KEK_*`，根 KEK 轮换是 Railway 运维操作而非 Admin 页面操作；旧版本保留到受控 rewrap 验证完成。恢复副本只在离线加密密码库。

真实 key 不进入源码、文档、OpenAPI、Docker build arg、日志或测试 fixture。配置对象在 composition root 创建并注入，领域 module 不直接读取 `process.env`。

## 15. 完成门禁

- app 之间没有源码 import，只有生成 client、contract 或内部 HTTP interface。
- module controller 无 Prisma/provider 逻辑；repository 不跨 owner 写表。
- Agent executor 的静态依赖和数据库角色都不能写 Agent/产品真相。
- 只有 Model Gateway 包含 Provider SDK、Provider key 解密、route release 和 invocation ledger。
- Asset Processor 不能让未扫描 revision 离开 quarantine；Evaluator 不能访问 production Session 或激活 release。
- 每个 executor 只 claim 注册给自己的 Job kinds，并通过共享 lease/fencing/drain contract tests。
- 本地/CI fake adapter 可完成全部业务测试，不需要模型、Railway 或 User key。
