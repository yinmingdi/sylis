# Model Execution

本上下文执行已经被业务 owner 授权的模型操作，拥有路由、Provider credential、一次性许可、调用、规范化交换、用量和健康事实；不拥有 Agent loop 或任何产品领域 truth。

## Language

**ProviderRouteRelease**:
经 Git、CI、离线评测和批准发布的不可变 endpoint、model、adapter、能力、价格与数据政策。
_Avoid_: model string, live endpoint config

**CredentialProfile**:
一个 Platform 或 User Provider 凭证的稳定身份。
_Avoid_: account credential row, environment key reference

**CredentialRevision**:
使用 per-record DEK envelope encryption 的不可变凭证版本。
_Avoid_: mutable secret JSON, plaintext token

**ModelExecutionPermit**:
绑定 caller、purpose、owner、route、credential revision、input digest、预算和 expiry 的一次性模型执行许可。
_Avoid_: API key, reusable bearer token

**ModelInvocation**:
一次逻辑模型调用的 route、credential revision、permit、input digest、汇总 usage/cost、最终状态与幂等事实；可产生文本、推理和多个工具调用组成的有序 content blocks。
_Avoid_: AgentRun, Provider HTTP attempt, raw provider response

**ModelInvocationAttempt**:
同一 ModelInvocation 下的一次实际 Provider transport 尝试；可重试错误只增加 attempt，不创建新的 AgentRunStep、Message 或 MessageBlock。
_Avoid_: model decision, Agent retry, silent failover

**ModelExchange**:
一次 Invocation 的规范化可留存输入输出清单；只有 consent 允许的 part 才保存正文引用。
_Avoid_: prompt dump, chain of thought, SDK response

**ModelContentBody**:
由 Model Gateway envelope-encrypt、按 owner/retention 管理的消息或交换正文。
_Avoid_: AgentMessage.content, log body

**ModelContentFragment**:
ModelContentBody 在封口前按 invocation、model position、Runtime parser 分配的 model sub-position 和 sequence 幂等追加的有界加密可见片段。
_Avoid_: Provider token log, AgentEvent plaintext, UI state
