# Agent Runtime 参考实现调研报告

> 日期：2026-08-15
>
> 状态：实现前决策输入，不是现行契约
>
> 对标版本：DeepSeek Harness `47f943859bef60e4160492346772ded9b24f765a`；OpenAI Codex `4861236f06d0df397436531b4aa3d7fa6975959c`

> 范围说明：本文中的 DeepSeek Harness 专指 DeepSeek 官方新开源仓库
> [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)，不是第三方同名项目，也不是仅讨论 DeepSeek API 的普通 tool-calling 行为。

## 1. 结论

Sylis 当前聊天失败不是 DeepSeek 模型“不稳定”，而是 Agent runtime 把正常的模型输出误判成非法：

1. Provider 契约只有单个 `toolCall?`，无法表达同一步中的多个调用。
2. Gateway 拒绝“可见文本 + tool call”，但 DeepSeek Harness 明确把文本、推理和多个 tool call 作为同一条有序 Assistant Message 的不同 ContentBlock。
3. DeepSeek adapter 已按 `tool_calls[].index` 正确聚合流式片段，却在结束时主动拒绝 `toolCalls.size > 1`。
4. Harness 收到第一个 `TOOL` 后立即返回，Executor 也只执行一个调用，因此没有批次调度、部分失败恢复和调用间屏障。
5. 流式响应发出 headers 后，异常仍进入 HTTP Problem Details Filter，产生二次写响应和 `ERR_HTTP_HEADERS_SENT`。
6. `AgentToolCall` 缺少模型步骤、模型顺序和 Provider call id；`@@unique([runId, actionDigest])` 还会把同一 Run 中参数完全相同的两次合法调用错误去重。

目标不是给现有代码加一个 `if`。应把 runtime 的基本单位从“一个模型请求只能选择文本或一个工具”改为：

```text
Run
  -> AgentRunStep（一次逻辑模型决策及其完整输出）
     -> ordered assistant content blocks
     -> zero or more ordered tool calls
        -> per-call authorization, execution and terminal result
  -> all calls terminal
  -> next AgentRunStep
```

采用以下原则：

- 一个模型步骤可以同时包含可见文本和多个 tool call。
- 每个调用有独立 `callId`、状态、结果、错误和时序。
- 不设置独立的“单批最多 N 个调用”拒绝阈值；继续保留 Run 级 `maxToolCalls`、成本、token、超时和权限预算。
- `maxParallelToolCalls` 只限制同时在飞数量，超出的调用排队，不拒绝整批。
- 明确标记为并发安全的只读调用可并发；写入、审批、记忆、Child Run、Wait 和控制操作保持授权且串行。
- 一个调用失败不会取消无关 sibling；所有成功和失败结果都返回给下一次模型调用。
- 下一次模型调用只能在当前步骤所有调用达到终态，或 Run 明确进入 `WAITING` 后开始。
- 前端不调用 `run/execute`，只发送 prompt/cancel/approval 等用户 command，并消费 Session SSE 投影。

## 2. 调研对象与证据等级

本报告把 DeepSeek API 文档降为协议背景，主要依据两个官方开源实现：

| 对象                                                                                                              | 固定版本              | 用途                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a) | `47f9438`，2026-08-13 | DeepSeek 自己的 provider adapter、Agent loop、工具调度、持久化与恢复 |
| [OpenAI Codex](https://github.com/openai/codex/tree/4861236f06d0df397436531b4aa3d7fa6975959c)                     | `4861236`，2026-08-15 | 多 output item、并发/独占执行闸门、per-call 失败和取消               |

DeepSeek Harness 仍标记为 developer preview，并明确提示未来会有破坏性变更。因此本项目应复制经过验证的语义和不变量，不应直接依赖其内部包或照搬 Cordis 组合系统。[官方 README](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/README.md)

## 3. DeepSeek Harness 实际如何工作

### 3.1 模型输出是有序 ContentBlock，不是互斥分支

DeepSeek Harness 的 Provider-neutral `AssistantMessage.content` 是有序 `ContentBlock[]`。文本、推理和任意多个 `ToolCallBlock { id, name, arguments }` 可以共存；每个 tool result 通过独立 `callId` 配对。[内容类型](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/llm/llm/src/types.ts#L53-L110)

DeepSeek adapter 同时序列化 Assistant Message 的 text、reasoning 和 `tool_calls[]`，并把每个结果展开成独立的 `{ role: "tool", tool_call_id }` 消息。由此可见，“先说一句再调用工具”不是歧义，而是应被保留的模型输出。[序列化实现](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/llm/llm-deepseek/src/serialize.ts#L70-L140)

### 3.2 流式 tool call 按 Provider index 聚合

官方 DeepSeek adapter 为每个 wire `tool_calls[].index` 维护独立状态，保留首片的 id/name，并持续拼接 arguments fragment，结束时为每个 index 生成独立 block。[流式聚合](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/llm/llm-deepseek/src/translate.ts#L86-L180)

这说明 Sylis 当前 `Map<number, ...>` 的聚合方向是对的，错误在于聚合完成后又主动拒绝 Map 中存在多个成员。需要删除的是拒绝策略，不是 index 聚合。

### 3.3 一个 step 执行该消息中的全部调用

AgentLoop 完整组装 Assistant Message 后，筛出其中所有 `tool-call` block，一次交给 `executeToolCalls()`。执行结束后才结束该 step，并从持久日志派生下一次模型请求。[Agent step](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/agent.ts#L332-L400)

DeepSeek Harness 对 turn 和 step 的定义值得直接采用：一个 step 是一次模型请求加上它调用的工具；一个 turn 可以包含多个 step。[架构说明](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md#turn-flow)

### 3.4 并发是 Harness 的责任

DeepSeek API 返回多个调用，不等于这些调用天然可以并发。Harness 在每个调用启动前执行 `isConcurrencySafe(args)`：只有精确返回 `true` 才归类为 `parallel`，未声明、异常、未知工具和其他返回值全部 fail closed 为 `exclusive`。[分类实现](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/tools/src/index.ts#L1269-L1285)

调度器的行为是：

- 连续的 parallel-safe 调用进入有界滚动池；
- exclusive 调用先等待当前池排空，再独占执行，并阻挡后续调用；
- 只有 dispatch/tool body 并发；pre policy、持久结果和附加上下文保持模型顺序；
- 每次启动前重新分类未启动调用；
- 默认并发度是 10，但这是 in-flight cap，不是批大小上限。

证据见 [tool-call scheduler](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/tool-calls.ts#L59-L245) 与 [默认并发度](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/constants.ts#L1-L6)。

### 3.5 失败、取消和恢复是 per-call 语义

普通工具异常会被 ToolRuntime 转成该调用自己的 `isError` 结果，其他 sibling 继续运行。[工具失败归一化](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/tools/src/index.ts#L1527-L1645)

取消时调度器停止补充新调用，等待已启动调用收敛，并为未启动调用写入 synthetic aborted call/result，保证持久日志里每个 call 都有终态 result。只有 scheduler 自身的不变量失败才终止整个 step。[取消处理](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/tool-calls.ts#L215-L288)

崩溃恢复也不会假装半个 turn 可以无损续跑：dangling call 会被修复成 `TOOL_NOT_STARTED` 或 `TOOL_OUTCOME_UNKNOWN`，然后补齐 step/turn 边界。[恢复实现](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/session/src/repair.ts#L18-L132)

### 3.6 前端不执行工具

Web client 只提交 session prompt/steer；Host 把请求交给 live Agent。工具由 Host 内 AgentLoop/ToolRuntime 执行，前端只消费持久的 `tool/call`、`tool/result` 等 session event 并渲染。刷新和回放绝不能再次执行工具。[Client session](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/client/runtime/src/client/sessions/session.ts#L184-L237)、[Host proxy](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/host/apiproxy/src/api-proxy.ts#L2461-L2516)

### 3.7 Cordis 是装配框架，不是 Agent 架构

DeepSeek Harness 才是包含 Session、LLM、Agent Loop、Tools、Policy 和 Persistence 的 Agent 架构。Cordis 是它内部使用的进程内插件组合与生命周期框架：通过 context service、typed event、依赖注入和可逆 effect 装配这些模块。[官方 Cordis Primer](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/cordis-primer.md)

Cordis 不提供 NestJS 的 HTTP controller、Guard、OpenAPI、请求校验或事务入口，也不能替代 NestJS。Sylis 可以采用 DeepSeek Harness 的 Agent 语义而不采用 Cordis；v1 的 `@sylis/agent-runtime` 是由 `agent-executor` 显式装配的纯 TypeScript 深模块。

## 4. Codex 实际如何工作

Codex 的协议形态与 DeepSeek Harness 不同，但核心不变量一致。

### 4.1 每个 output item 独立调度

Codex 在一次模型响应中逐项处理 output item。每遇到一个 tool call，就立即记录 call，创建一个 future 并放入 `FuturesOrdered`；工具可能在模型 response completed 之前开始，流结束后再按插入顺序 drain 全部 future，之后才进入后续模型请求。[响应循环](https://github.com/openai/codex/blob/4861236f06d0df397436531b4aa3d7fa6975959c/codex-rs/core/src/session/turn.rs#L2195-L2199)、[调用入队](https://github.com/openai/codex/blob/4861236f06d0df397436531b4aa3d7fa6975959c/codex-rs/core/src/session/turn.rs#L2349-L2363)、[有序 drain](https://github.com/openai/codex/blob/4861236f06d0df397436531b4aa3d7fa6975959c/codex-rs/core/src/session/turn.rs#L2101-L2125)

`FuturesOrdered` 保证结果回填顺序，不提供 DeepSeek Harness 的 `maxParallelToolCalls` 有界滚动池。Sylis 采用有序回填，但为了整步 preflight 和生产容量控制，不采用 Codex 的提前启动或无显式 in-flight cap。

### 4.2 读写闸门保证并发安全

Codex 为一个模型步骤共享 `RwLock`。允许并发的工具拿 read lock，可以重叠；不允许并发的工具拿 write lock，与所有 sibling 串行。工具是否支持并发由静态 capability 决定且默认 false。[ToolCallRuntime](https://github.com/openai/codex/blob/4861236f06d0df397436531b4aa3d7fa6975959c/codex-rs/core/src/tools/parallel.rs#L41-L60)、[执行闸门](https://github.com/openai/codex/blob/4861236f06d0df397436531b4aa3d7fa6975959c/codex-rs/core/src/tools/parallel.rs#L113-L176)

### 4.3 非致命失败转换为独立 tool output

一个工具的非致命失败不会抛毁整轮，而会转换为带 `success: false` 的 `FunctionCallOutput`，仍然用原 call id 返回给模型。只有显式 Fatal 错误才终止整个 runtime。[失败转换](https://github.com/openai/codex/blob/4861236f06d0df397436531b4aa3d7fa6975959c/codex-rs/core/src/tools/parallel.rs#L73-L87)、[失败输出](https://github.com/openai/codex/blob/4861236f06d0df397436531b4aa3d7fa6975959c/codex-rs/core/src/tools/parallel.rs#L225-L254)

### 4.4 每个调用独立可观测

Codex 以 `conversation.id + turn_id + call_id + tool_name` 记录每个调用的排队、handler 和总耗时，而不是只记录整个 Agent turn 的一个模糊失败。[调用时序 telemetry](https://github.com/openai/codex/blob/4861236f06d0df397436531b4aa3d7fa6975959c/codex-rs/core/src/tools/parallel.rs#L282-L360)

## 5. 来源归属与采用矩阵

| 上游事实                                                     | Sylis 直接采用                                                        | Sylis 调整                                                       | Sylis 明确不采用                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| DeepSeek ordered ContentBlock、完整 Assistant Message 组装   | mixed text/tool、多调用、provider index、Turn/Step                    | Provider stream 进入完整 Step proposal 后再做关系事务 preflight  | singular tool signal、依赖请求参数禁止多调用        |
| DeepSeek bounded rolling pool、exclusive barrier、逐调用取消 | fail closed concurrency、排队不拒绝、每个 call 有终态                 | plan 先由 Agent API 授权，adapter 只能降级为 exclusive           | 把默认并发度 10 当成固定产品限制                    |
| DeepSeek append-only Session log 与 crash repair             | durable event、明确 unknown outcome、回放不执行工具                   | PostgreSQL 关系表保存当前真相，AgentEvent 只保存时间线/SSE       | 把 Session log 作为 Sylis 唯一数据库真相            |
| DeepSeek 使用 Cordis 组合全部插件                            | capability seam、可测试 adapter、明确生命周期                         | Runtime 用构造注入的纯 TypeScript port，由 Executor 显式装配     | Cordis 生产依赖、动态配置树、第二套 DI/事件总线     |
| Codex 独立 call id、失败结果化、RwLock gate、telemetry       | per-call identity、非致命失败、执行闸门、queue/handler/total duration | 与 DeepSeek rolling pool 合并为有界调度                          | response completed 前提前执行、无显式 in-flight cap |
| Codex `FuturesOrdered`                                       | 工具可并发完成但结果按模型顺序回填                                    | receipt 先持久提交再进入下一次模型请求                           | 把完成顺序当成模型上下文顺序                        |
| Sylis 多用户业务约束                                         | 不属于上游实现                                                        | 整步 preflight、Permit、Grant、fencing、typed owner、Session SSE | 把这些 Sylis 扩展描述成 Codex/DeepSeek 原生事务     |

## 6. 调研时的 Sylis 差距

> 实施状态（2026-08-15）：本节记录调研开始时的基线问题，不再描述当前源码。第 7、8 节的目标已经落地为 provider-neutral ordered Block stream、durable Step/Attempt、`@sylis/agent-runtime`、全批 preflight、逐调用 receipt 与 Session SSE；最终执行证据仍以验收清单为准。

### 6.1 调研时 Provider contract 只能表示一个调用

[`StreamingGenerationChunk`](../../../../apps/backends/model-gateway/src/providers/contracts.ts) 只有 `delta: string`、`toolCall?` 和 `controlSignal?`。这会迫使 Gateway 把本应是有序集合的 Provider 输出压缩成互斥状态。

[`DeepSeekAdapter.stream()`](../../../../apps/backends/model-gateway/src/providers/deepseek/deepseek.adapter.ts) 已按 index 聚合多个调用，却在 `toolCalls.size > 1` 时抛 `MULTIPLE_TOOL_CALLS`。请求中的 `parallel_tool_calls: false` 不能替代接收端正确处理 Provider 实际返回的多个调用。

注意：同一 adapter 的 `structured()` 使用 forced strict function call 作为结构化 JSON 通道，要求恰好一个 tool call 是合理的。改造只针对 Agent streaming/tool loop，不能把 structured generation 一并放宽。

### 6.2 调研时 Gateway 错误地拥有 Agent 输出选择

[`InternalModelController.agentStream()`](../../../../apps/backends/model-gateway/src/modules/invocations/internal-model.controller.ts) 使用 `selectedControl`，并在文本后出现 tool call 时抛 `AGENT_PROVIDER_TOOL_CALL_AMBIGUOUS`。它还直接把 control tool 转成 Proposal、Artifact、Child Run、Memory 或 Wait signal。

这违反现有边界：Model Gateway 应只拥有 Provider 适配、Invocation、Exchange、usage 和 credential；目标 Agent action 路由属于 `@sylis/agent-runtime`。Gateway 不应决定一个 Provider tool name 对应哪个 Agent 领域命令。

### 6.3 调研时 Harness 和 Executor 都是 singular

重构前的 `packages/agent-harness` 中，`AgentModelSignal` 只有单个 `TOOL`，`createAgentHarness()` 在第一个 tool signal 后立即 `return`。[`activate-agent-run.ts`](../../../../apps/backends/agent-executor/src/handlers/activate-agent-run.ts) 也在 command loop 中同步执行一个 tool directive，没有 batch preflight、并发池或结果排序。旧包已由 `@sylis/agent-runtime` 替代，因此这里保留历史结论而不再链接已删除源码。

### 6.4 调研时持久模型缺少 step 和 model order

当前 `packages/database/prisma/schema/agent.prisma` 中的 `AgentToolCall` 只有 `runId`，没有：

- 对应的 `ModelInvocation` / Agent step；
- Provider call id；
- 同一步中的 model position；
- concurrency mode；
- queued/cancelled/unknown outcome 等执行事实。

`@@unique([runId, actionDigest])` 不是调用身份。同一 Run 合法地以相同参数读取两次时，action digest 相同，但这仍然是两个不同 call。Digest 应用于防篡改和授权绑定，不应用于替代 call identity。

### 6.5 流式错误没有 in-band 终态

[`ProblemDetailsFilter`](../../../../apps/backends/model-gateway/src/platform/http/problem-details.filter.ts) 不检查 `response.headersSent`。`agentStream()` 写出 NDJSON 后抛错，Filter 再写 `application/problem+json`，会造成重复 500 和 `ERR_HTTP_HEADERS_SENT`。更重要的是 Invocation 可能没有可靠进入终态。

## 7. 目标架构

### 7.1 Provider-neutral 流协议

用有序事件替换 singular `StreamingGenerationChunk`：

```typescript
enum ModelStreamEventType {
  INVOCATION_STARTED = "INVOCATION_STARTED",
  BLOCK_STARTED = "BLOCK_STARTED",
  TEXT_DELTA = "TEXT_DELTA",
  REASONING_DELTA = "REASONING_DELTA",
  TOOL_CALL_DELTA = "TOOL_CALL_DELTA",
  BLOCK_COMPLETED = "BLOCK_COMPLETED",
  USAGE = "USAGE",
  RESPONSE_COMPLETED = "RESPONSE_COMPLETED",
  RESPONSE_FAILED = "RESPONSE_FAILED",
}

type ModelStreamEvent =
  | { type: ModelStreamEventType.INVOCATION_STARTED; invocationId: string }
  | {
      type: ModelStreamEventType.BLOCK_STARTED;
      index: number;
      kind: ModelContentBlockKind;
    }
  | {
      type: ModelStreamEventType.TEXT_DELTA;
      index: number;
      sequence: number;
      text: string;
    }
  | {
      type: ModelStreamEventType.REASONING_DELTA;
      index: number;
      sequence: number;
      text: string;
    }
  | {
      type: ModelStreamEventType.TOOL_CALL_DELTA;
      index: number;
      providerCallId?: string;
      nameDelta?: string;
      argumentsDelta: string;
    }
  | {
      type: ModelStreamEventType.BLOCK_COMPLETED;
      index: number;
      block: ModelContentBlock;
    }
  | { type: ModelStreamEventType.USAGE; usage: ProviderUsage }
  | {
      type: ModelStreamEventType.RESPONSE_COMPLETED;
      finishReason: ModelFinishReason;
    }
  | { type: ModelStreamEventType.RESPONSE_FAILED; failure: ModelFailure };
```

要求：

- adapter 只做 wire protocol 到此协议的转换；
- block index 保持 Provider 顺序并允许 delta 交错；
- Provider 失败必须变成唯一 terminal event 或在统一 runtime 边界被规范化；
- `RESPONSE_COMPLETED/FAILED` 之后不得再有 event；
- 隐藏推理可以用于 Provider passback，但不得作为 User 可见正文或普通日志；
- `structured()` 继续使用独立的单输出契约。

### 7.2 Agent step，而不是原子 ToolBatch 聚合

新增 `AgentRunStep` 作为一次逻辑模型决策和调用集合的父对象。无需再创建一个拥有“整批成功/失败”语义的 `AgentToolBatch`：step 已经提供天然分组，单个 tool call 才是执行和失败的事实。Provider transport retry 只在同一 `ModelInvocation` 下增加 `ModelInvocationAttempt`，不创建新 Step。

```text
AgentRunStep
  id
  runId
  ordinal
  modelInvocationId
  status
  finishReason?
  assistantContentBodyId?
  startedAt / completedAt
  unique(runId, ordinal)
  unique(modelInvocationId)

AgentToolCall
  id                         # 不再由 actionDigest 充当身份
  stepId
  modelPosition
  providerCallId
  toolKey / schemaVersion / toolReleaseId
  inputHash / inputContentBodyId / actionDigest
  grantId / sideEffectClass / concurrencyMode
  status / result / error / timestamps
  unique(stepId, modelPosition)
  unique(stepId, providerCallId)
```

建议新增枚举：

```text
AgentRunStepStatus = STREAMING | TOOL_EXECUTION | WAITING | COMPLETED | FAILED | CANCELLED | UNKNOWN_OUTCOME
AgentToolConcurrencyMode = PARALLEL_SAFE | EXCLUSIVE
AgentToolCallStatus = PROPOSED | APPROVED | QUEUED | RUNNING | SUCCEEDED | FAILED | REJECTED | CANCELLED | UNKNOWN_OUTCOME
```

`actionDigest` 继续绑定 `toolKey + schemaVersion + input`，用于验证内容未变；幂等 identity 改为 `stepId + providerCallId` 或 `stepId + modelPosition`。同一步 Provider call id 缺失时可按 `invocationId + modelPosition` 生成稳定 fallback id。

### 7.3 闭合、版本化的 step proposal

Gateway 输出 Provider-neutral block。Runtime 在 response terminal 时组装完整 `AgentStepProposal`，其中 action 是闭合 discriminated union，不允许任意 action 字符串：

```typescript
interface AgentStepProposal {
  stepId: string;
  invocationId: string;
  ordinal: number;
  assistantContentBodyId?: string;
  actions: readonly AgentStepAction[];
}

type AgentStepAction =
  | {
      kind: AgentStepActionKind.DOMAIN_TOOL;
      position: number;
      call: ProposedToolCall;
    }
  | {
      kind: AgentStepActionKind.PROPOSAL;
      position: number;
      proposal: AgentProposalInput;
    }
  | {
      kind: AgentStepActionKind.ARTIFACT;
      position: number;
      artifact: AgentArtifactRevisionInput;
    }
  | {
      kind: AgentStepActionKind.CHILD_RUN;
      position: number;
      childRun: AgentChildRunInput;
    }
  | {
      kind: AgentStepActionKind.MEMORY;
      position: number;
      memory: AgentMemoryCardUpsertInput;
    }
  | {
      kind: AgentStepActionKind.WAIT;
      position: number;
      wait: AgentWaitConditionInput;
    };
```

这不是 generic `/actions`：action kind、payload 和 owner 都是编译期闭合、版本化的，Agent API 仍调用各 typed domain handler。它的目的只是先看到模型该 step 的完整提议，再在任何副作用发生前完成全批 preflight。

### 7.4 两阶段授权与执行

Agent API 在一个事务中对整批执行 preflight：

1. step/invocation/run/fencing token 匹配；
2. Provider call id 和 model position 唯一；
3. tool 在固定 CapabilityRelease 中；
4. input schema、ToolRelease、Grant、scope 和 expiry 有效；
5. `batch count <= run remaining maxToolCalls`，但不存在单独 batch hard limit；
6. action digest、owner、目标 revision 和幂等 identity 有效；
7. 写入/审批/控制 action 的组合满足产品策略；
8. 创建所有 call/action facts 和 execution directives。

Runtime 在每个 call 真正启动前通过 Agent API adapter 再次校验 lease/cancellation/fencing，防止 preflight 后 Grant 撤销或 Run 取消。第二次校验只能保持或收紧权限，不能扩大授权。

### 7.5 调度算法

调度器按 `modelPosition` 扫描：

```text
parallel-safe calls -> bounded rolling pool K
exclusive call      -> drain pool -> execute alone -> continue
parallel-safe calls -> next rolling pool
```

规则：

- `PARALLEL_SAFE` 必须由 tool implementation/release 显式声明，默认 `EXCLUSIVE`；
- `READ_PUBLIC/READ_PRIVATE` 也不能自动视为安全，只有实现确认共享状态、rate limit 和快照语义可并发后才 opt in；
- 所有 write、approval、memory、Child Run、Wait 和 control action 固定 `EXCLUSIVE`；
- K 是 Executor 注入 Runtime 的 activation concurrency 配置，调用超过 K 时排队；
- policy 与持久提交按模型顺序，tool body 可以乱序结束；
- 任一 action 使 Run 进入 `WAITING` 时停止启动其后的 action，并为未启动项记录明确终态或保留为可恢复 queued 状态；不能静默丢弃；
- 下一模型 step 读取按 modelPosition 排列的全部结果，而不是 completion order。

### 7.6 部分失败、取消与 crash recovery

普通失败：

- schema/authorization failure 在 preflight 阶段阻止所有副作用，并返回逐项拒绝原因；
- tool body failure 只使该 call `FAILED`，继续其他已授权 sibling；
- 下一模型 step 同时看到每个 success/failure result，以便解释或恢复；
- scheduler/runtime invariant failure 才使整个 step `FAILED`。

取消：

- 停止补充未启动调用；
- 传播 `AbortSignal` 到已启动调用并等待其达到 quiescence；
- 已启动但无法判断副作用结果的调用进入 `UNKNOWN_OUTCOME`，不得自动重试写操作；
- 未启动调用进入 `CANCELLED`，错误码区分 `ABORTED_BEFORE_DISPATCH`；
- 所有已接受 call 都必须存在一个终态结果事件。

恢复：

- `RUNNING` step 和 call 由 reconciliation job 根据 JobAttempt lease、heartbeat 和 owner service 查询；
- 只读且明确幂等的 call 可按同一 call identity 恢复；
- 写操作没有下游幂等证据时进入 `UNKNOWN_OUTCOME` 并等待人工或领域 reconciliation；
- 不允许因为进程重启重新播放前端 event 而执行工具。

### 7.7 流式 HTTP 与前端

Model Gateway 的内部 NDJSON controller 必须自己闭合 stream：

- headers 发送前的错误使用 Problem Details；
- headers 发送后的错误写一个 `RESPONSE_FAILED` terminal frame，然后 `end()`；
- Filter 检测 `headersSent`，只记录已脱敏错误且不得再次 `.status().json()`；
- `ModelInvocation`、permit 和 usage reservation 在 `finally`/abort 路径进入终态；
- `agent-api` 的 Session SSE 仍是浏览器唯一实时接口。

前端只需要按 `stepId + callId` 投影多个 tool card，显示 queued/running/succeeded/failed/cancelled；同一步的 preamble 正常留在 Assistant Message 中。它不请求 Model Gateway、不直接请求 Executor、不轮询 run，也不重放 execute。

## 8. 服务与代码调整范围

| 模块                                     | 调整                                                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `model-gateway/providers/contracts.ts`   | 用有序 block stream 替换 singular `toolCall?`                                                                                                   |
| `providers/deepseek/deepseek.adapter.ts` | 保留按 index 聚合；删除多调用拒绝；输出 block events；保留 structured 单调用规则                                                                |
| OpenAI/Anthropic/Gemini adapters         | 映射到同一 provider-neutral block protocol                                                                                                      |
| `internal-model.controller.ts`           | 不再用 `selectedControl` 决定互斥输出；不再拥有 Agent control routing；正确输出 terminal frame                                                  |
| `model-execution.service.ts`             | 所有完成、异常、abort 和 consumer disconnect 路径结算 Invocation/permit                                                                         |
| `problem-details.filter.ts`              | `headersSent` 后禁止第二次 HTTP 响应                                                                                                            |
| `@sylis/agent-contracts`                 | 新增 step、ordered action、`AgentStepReceipt`、concurrency/status 枚举                                                                          |
| `@sylis/agent-runtime`                   | 组装完整 step；保留 preamble；有界调度获准 plan；等待所有结果后才请求下一模型 step                                                              |
| `agent-api`                              | AgentRunStep owner；全批 preflight；逐项 typed handler；结果排序与恢复                                                                          |
| `agent-executor`                         | claim activation Job；装配 Runtime、Model/Step/Tool adapter 与 graceful shutdown                                                                |
| Prisma schema                            | 新增 AgentRunStep 与 ModelInvocationAttempt；AgentToolCall 增加 step/order/provider identity/concurrency/status；删除 run/actionDigest 唯一身份 |
| Web                                      | 继续只消费 Session SSE；按 step/call 投影并发状态，不增加 execute API                                                                           |

## 9. 不应照搬的内容

1. 不把 Cordis 或“Everything is a Plugin”整体引入 Sylis。v1 Runtime 是框架无关纯 TypeScript 深模块；NestJS 继续负责 HTTP 应用，Cordis 不替代 NestJS。
2. 不把 DeepSeek Harness 的 append-only session log 变成 Sylis 唯一数据库真相。Sylis 继续由关系表保存当前状态，`AgentEvent` 保存时间线和 SSE replay。
3. 不引入 `run_code`、shell 或任意代码执行。现行 Learning Agent v1 明确禁止这些能力。
4. 不把 DeepSeek Harness 默认并发度 10 当成 batch limit。Sylis 需要按生产容量配置 K，同时保留 Run 级预算。
5. 不依赖 `parallel_tool_calls: false` 阻止 Provider 返回多个调用。接收端必须始终正确处理协议允许的输出。
6. 不放宽 lexicon/compiler 等 structured generation 的单 strict-call 约束；那是结构化返回通道，不是 Agent loop。
7. 不把 action digest 当 call id，也不把“同参数”误认为“同一次调用”。

## 10. 实施顺序

### 阶段 A：修正 Provider 与 stream 契约

- 引入 `ModelStreamEvent` / ContentBlock / terminal finish 枚举。
- 改造四个 Provider adapter 和 fake adapter。
- DeepSeek 支持 interleaved 多 index、mixed text/tool calls。
- structured generation 保持现状。
- 修复 headers-sent 和 Invocation 终态。

### 阶段 B：建立 durable Agent step

- 重构 Prisma schema，新增 `AgentRunStep`。
- ToolCall 增加 step、position、providerCallId、concurrencyMode 和完整终态。
- 删除 `@@unique([runId, actionDigest])`，重新定义幂等键。
- Agent API 创建/结算 step，并让 activation 按 step/model order 读取 tool evidence。

### 阶段 C：完整 step proposal 与全批 preflight

- 将 `agent-harness` 迁为 `agent-runtime`，从 stream 组装完整 step，而不是遇到首个 tool 就 return。
- Model Gateway 移除 control-tool 领域路由。
- Agent API 增加闭合、版本化的 step proposal ingress。
- 在事务内校验整批预算、授权、schema、digest 和组合策略。

### 阶段 D：Runtime 多调用调度

- 在 Runtime 内实现 parallel-safe rolling pool 和 exclusive barrier，Executor 只装配 adapter。
- per-call timeout、AbortSignal、部分失败和 ordered result commit。
- approval/wait/control 形成串行暂停屏障。
- reconciliation 处理 dangling/unknown outcomes。

### 阶段 E：投影、可观察性与最终验收

- 前端按 step/call 显示多个调用状态和文本 preamble。
- 增加 per-call queue/handler/total duration、invocationId、stepId、callId 日志与 trace。
- 更新 Learning Agent、Model Gateway、backend structure 和验收清单文档。
- 完成单元、契约、集成和 E2E 验收后再推送。

## 11. 测试与验收清单

### Provider contract

- DeepSeek 三个 interleaved tool call index 正确聚合。
- text、reasoning、tool call 同一步共存且顺序稳定。
- arguments fragment、空首帧、usage trailer、`[DONE]`、length truncation 和 disconnect 均有唯一终态。
- structured generation 仍拒绝零个或多个 strict result call。

### Runtime/scheduler

- 三个 parallel-safe read 在 K 范围内重叠执行。
- `read -> write -> read` 形成三个有序 group，write 期间无 sibling 执行。
- 后一个 read 先完成时，持久结果仍按 model order。
- 一个调用失败，其他调用完成，下一模型 step 同时收到全部结果。
- 完全相同参数的两个调用保留两个 call identity。
- 调用数超过 K 时排队而非拒绝；超过 Run 剩余 `maxToolCalls` 时在副作用前整批失败。
- approval/wait/memory/child/control 永不并发。

### Persistence/recovery

- 每个 accepted call 恰好一个 terminal result。
- 每个 AgentRunStep 恰好关联一个 ModelInvocation。
- Provider transport retry 只新增 ModelInvocationAttempt，不新增 AgentRunStep。
- Provider/HTTP/consumer abort 后 Invocation、permit、step 都不会永久停在 `RUNNING`。
- crash 后 started/unstarted/unknown-outcome 三类调用被明确区分。
- SSE replay 和页面刷新不会再次执行任何 tool。

### HTTP/UI E2E

- 一次正常聊天只建立一条 Session SSE，不出现前端轮询 run/messages。
- 用户发送 prompt 后，preamble、多个 tool card、各自结果和最终回答按同一时间线显示。
- headers 已发送后的内部错误只产生一个 in-band failed frame，不产生 `ERR_HTTP_HEADERS_SENT`。
- fake provider 覆盖所有确定性场景；真实 DeepSeek smoke 由人工持有 key 触发，只验证协议和世界状态，不断言逐字文本。

## 12. 最终决策

Sylis 应采用“DeepSeek Harness 的 step/content-block/rolling-pool 语义 + Codex 的独立 call outcome/执行闸门/telemetry”，在服务端 `@sylis/agent-runtime` 中实现，并保持自身更严格的领域 owner、一次性 permit、ToolGrant、Proposal 和关系数据库真相。Runtime 不依赖 Cordis、NestJS、数据库或 Provider SDK；`agent-executor` 是它的部署 composition root。

实现完成后的核心不变量是：

> 模型一次提出多少个调用都能被完整表达；系统只并发执行明确安全的调用；每个调用都独立授权、独立落库并拥有终态；下一次模型请求只消费已经完整、按模型顺序记录的结果。
