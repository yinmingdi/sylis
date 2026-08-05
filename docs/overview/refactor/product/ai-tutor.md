# 在线 AI 导师、语法与生成任务

## 1. 边界

在线 AI 是受控学习能力，不是可任意调整 provider 参数的 playground。离线 Lexicon AI 属于 Compiler；在线 Tutor、GrammarDiagnosis 和 ReadingGeneration 属于 AI Tutor 上下文并由 Worker 执行。两者复用同一小型 provider port，但使用不同密钥、预算、prompt、数据权限和审计。

API 只鉴权并在同一事务创建领域 request、`BackgroundJob` 和 outbox event，不加载 provider key、不直接调用模型。Worker 只能产出本领域结果；在线 AI 不写 LexiconRelease、ExerciseRevision、AssessmentResult 或 FSRS 状态。

## 2. 能力

| Capability            | 交互方式      | 输入边界                                       | 输出                                     |
| --------------------- | ------------- | ---------------------------------------------- | ---------------------------------------- |
| `TUTOR_CHAT`          | SSE streaming | 用户消息 + 显式选择的 Objective/Sense/Document | 同一 TutorMessage 的 stream/revision     |
| `GRAMMAR_DIAGNOSIS`   | async Job     | 一段用户文本 + language/level                  | typed observations、evidence、suggestion |
| `READING_GENERATION`  | async Job     | policy + ReadingTargets + approved facts       | validated ReadingDocumentRevision        |
| `FEEDBACK_ASSISTANCE` | async Job     | practice-only response + rubric                | 非 summative 建议                        |

Tutor 不默认读取全部聊天、阅读或学习历史。每次 request 明确列出 `contextRefs`、purpose 和 consent basis；服务端解析引用并裁剪最小 projection，Web 不能上传任意数据库对象。

## 3. 核心对象

| 对象                   | 关键字段                                                                      | 规则                                             |
| ---------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ |
| `TutorSession`         | userId、title、policyVersion、status                                          | ACTIVE/ARCHIVED/DELETED                          |
| `TutorMessage`         | sessionId、role、sequence、jobId?、createdAt                                  | append-only identity；assistant 生成绑定一个 Job |
| `TutorMessageRevision` | messageId、contentCiphertext、keyVersion、languageTag、contentHash、createdAt | stream 完成后发布不可变 revision                 |
| `TutorContextRef`      | message/job、typed Objective/Sense/DocumentRevision/Attempt target            | owner/consent/release 校验                       |
| `GrammarDiagnosis`     | userId、jobId、inputCiphertext、schemaVersion、resultCiphertext               | jobId unique；不复制执行状态                     |
| `ReadingGeneration`    | userId、jobId、policyVersion、requestCiphertext、publishedRevisionId?         | jobId unique；成功结果必须是 immutable revision  |
| `PromptTemplate`       | key、version、schemaVersion、contentHash、status                              | 发布后不可变                                     |
| `ModelInvocation`      | jobId、provider/model/responseId、promptVersion、tokens/cost/latency、status  | 不存 secret；raw payload 加密隔离                |
| `AIUsageLedger`        | user/capability/window、reserved/settled units、idempotencyKey                | append-only ledger + 可重建 projection           |

执行状态只从 `BackgroundJob` 读取，完整状态机、lease、retry、cancellation 和 SSE 见 [BackgroundJob、Worker 与进度协议](../architecture/background-jobs.md)。

## 4. 两个 provider port

业务层只有结构化生成和流式生成两个端口。成本计算、重试、预算和具体 provider config 不塞入端口方法；这些由 usage policy、Job handler 和 adapter metadata 处理。

```typescript
export interface StructuredGenerationPort {
  generate<Input, Output>(request: {
    capability: AICapability;
    modelPolicy: ModelPolicyRef;
    promptTemplate: PromptTemplateRef;
    input: Input;
    outputSchema: JsonSchema<Output>;
    idempotencyKey: string;
    signal: AbortSignal;
  }): Promise<StructuredGenerationResult<Output>>;
}

export interface StreamingGenerationPort {
  stream<Input>(request: {
    capability: AICapability;
    modelPolicy: ModelPolicyRef;
    promptTemplate: PromptTemplateRef;
    input: Input;
    idempotencyKey: string;
    signal: AbortSignal;
  }): AsyncIterable<StreamingGenerationEvent>;
}
```

`packages/ai-provider` 导出 port contract、provider-neutral result/event 和 DeepSeek adapter。adapter 将外部 DTO 映射为内部 contract；Compiler public API 只接收注入的 `StructuredGenerationPort`，Compiler Runner composition root 注入 compiler 端口，Worker composition root 注入 runtime 两个端口。业务 module 不 import DeepSeek SDK 或读取 `DEEPSEEK_*`。

DeepSeek adapter 的默认 base URL 是 `https://api.deepseek.com`，模型名来自 validated environment policy，不写入 API DTO、数据库 enum 或 prompt。runtime 与 compiler 使用不同的 sealed key 和 provider project；真实 key 不进入文档、artifact、日志、OpenAPI、浏览器 bundle 或 Docker build argument。[DeepSeek API](https://api-docs.deepseek.com/)

## 5. 结构化生成

Grammar、Reading 和离线 enrichment 都提供固定 JSON Schema。adapter 只能返回：

- `output`：已通过 provider-independent parser 的 typed value；
- `metadata`：provider、model、response ID、token、cost input 和 latency；
- `validation`：schema/version 与 provider structured-output mode。

禁止从 prose 用正则猜 JSON 字段。schema 失败是可审计 invocation failure；handler 可按 registry policy 重试一次修复 prompt，但不能把不合法输出局部写入领域表。ReadingGeneration 只有在内容、安全、引用和 lexical target 全部验证后，才在一个事务发布 `ReadingDocumentRevision` 并终结 Job。

## 6. 流式生成

Tutor request 在事务中追加 user message、assistant placeholder、`TUTOR_RESPONSE` Job 和 outbox event。Worker 将 provider delta 写入受限的 append-only `TutorStreamEvent`，API 只对 owner-scoped SSE relay；浏览器重连通过 `Last-Event-ID` 继续同一 assistant message 和同一 ModelInvocation。

流事件为 `message.started`、`message.delta`、`tool.started`、`tool.completed`、`message.completed`、`message.failed`。sequence 单调递增；delta 不是最终事实，完成时合并、验证、加密为一个不可变 `TutorMessageRevision`。断线、API 重启和 Redis 重启不得创建第二次 invocation 或重复收费。

## 7. 工具、上下文与安全

- 工具调用按 capability allowlist、参数 schema、owner scope 和最大调用数校验。
- prompt template、system policy、用户文本和外部文档使用不同结构字段；外部正文始终是不可信 data。
- 每个 `ModelInvocation` 记录 input evidence IDs、prompt version 和 policy version，不能只记录最终 prompt 字符串。
- 语法诊断给出 observation/evidence/suggestion，不输出虚构“权威分数”。
- AI-only correctness、开放翻译和自由造句只用于 practice feedback，不能成为 summative 评分。
- User consent、内容安全、留存和外部传输策略由服务端强制，客户端不能关闭门禁。

## 8. 配额与成本

- 用户日/月 capability quota、系统月度预算和 provider concurrency 三层门禁。
- 调用前以 idempotency key reserve，完成后按真实 usage settle，失败释放未使用 reserve。
- Compiler 预算与 runtime 预算完全分开；200 lemma pilot 和逐 run approval 只适用于离线构建。
- 达到 80% 发告警，100% 将新 Job 置于 `PAUSED/BUDGET_APPROVAL_REQUIRED` 或拒绝创建；不能自动切换更贵模型绕过预算。
- Admin 只能看到成本、状态和裁剪 metadata；support/reviewer 默认不能读取用户原文。

## 9. 留存

产品已选择完整且永久的可识别内容留存，因此正文必须应用字段级 envelope encryption、独立 key version、严格读取权限和逐次审计，且不得进入普通日志、trace 或分析 warehouse。该偏好不能在法律审查完成前作为 production 默认启用，详见 [身份与独立用户](./identity-user.md) 和 ADR 0009。

## 10. 验收

- fake `StructuredGenerationPort`/`StreamingGenerationPort` 驱动全部业务测试，不需要真实 key。
- provider contract test 覆盖 structured schema、stream 顺序、429/5xx、timeout、abort、usage 和 redaction。
- Job crash/retry 不产生重复 MessageRevision、ReadingDocumentRevision、ModelInvocation charge 或 ledger settlement。
- owner、consent、release、prompt injection 和工具参数越权均有拒绝测试。
