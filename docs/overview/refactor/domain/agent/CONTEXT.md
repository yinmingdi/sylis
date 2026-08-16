# Learning Agent

本上下文描述每个 User 的通用学习代理、其受控行动和可审计生成内容，不拥有正式词典、学习评分或身份真相。

## Language

**AgentSession**:
User 与 Learning Agent 进行连续交互的空间；可保存多个 QUEUED Root Run，但同一时刻至多一个 Root Run 处于 RUNNING 或 WAITING。
_Avoid_: TutorSession, ChatSession, generic chat

**AgentMessage**:
AgentSession 中按顺序追加、对 User 可见的一次用户、Agent 或工具发言 envelope；内容由一个或多个 AgentMessageBlock 表达，历史发言不原地改写。
_Avoid_: prompt row, TutorMessage

**AgentMessageBlock**:
AgentMessage 内具有稳定身份、明确类型、父子位置、流式生命周期和 typed payload/reference 的最小可见内容单元；可表达文本结构或引用 ToolCall、Artifact、Proposal、Plan、WaitCondition 与 Asset。
_Avoid_: ModelContentBlock, arbitrary JSON card, React component, editable chat row

**AgentRun**:
Learning Agent 为一个明确目标执行的领域流程，可运行、等待、成功、失败或取消。
_Avoid_: Job, model request

**AgentRunStep**:
AgentRun 中一次逻辑模型决策、其完整有序 Assistant 输出及全部直接 action 的持久分组；每个 Step 恰好对应一个 ModelInvocation，Provider transport retry 不产生新 Step。
_Avoid_: ToolBatch, model chunk, transport attempt, atomic batch

**ModelInvocation**:
Model Gateway 拥有的一次逻辑模型调用，固定 route、credential revision、permit、input digest 和最终 usage/cost；AgentRunStep 恰好引用一个。
_Avoid_: Provider HTTP attempt, AgentRunStep

**ModelInvocationAttempt**:
同一 ModelInvocation 下的一次实际 Provider transport 尝试；重试只增加 ordinal attempt，不改变 Agent Step 或模型输入身份。
_Avoid_: Agent retry, new Step, silent failover

**Root Run**:
直接响应 User 指令并拥有最终结果的 AgentRun。
_Avoid_: main task

**ChildRun**:
由 Root Run 创建、范围受限且结果回传给 Root Run 的并行子流程。
_Avoid_: nested agent

**AgentWaitCondition**:
AgentRun 继续前必须满足的批准、用户输入、ChildRun 或外部事件条件。
_Avoid_: paused job

**Capability**:
Learning Agent 可执行的一类稳定学习能力，例如词汇解释、语法分析或练习生成。
_Avoid_: page, tool

**CapabilityRelease**:
某项 Capability 的不可变 prompt、输出契约、工具策略、执行模式和允许路由版本；workflow/agent-loop 还要求可见 immutable plan。
_Avoid_: live prompt

**AgentToolCall**:
Agent 在某个 AgentRunStep 中按明确模型顺序提出的一次工具调用；拥有独立身份、授权、状态和终态结果。
_Avoid_: function log, action digest, batch member without identity

**AgentToolGrant**:
User 或系统授予 Agent 的有时限、有限资源范围和有限副作用权限。
_Avoid_: blanket permission

**AgentProposal**:
Agent 提出的、尚未成为正式领域事实的 typed write 意图。
_Avoid_: generated fact, direct mutation

**AgentArtifact**:
Agent 为 User 生成的文章、分析、练习集或解释等可版本化内容身份。
_Avoid_: raw completion, Article blob

**AgentMemoryCard**:
User 可查看、更正、删除或抑制的一条长期记忆陈述。
_Avoid_: hidden profile, chain of thought

**ContextSnapshot**:
一次 AgentRun 实际使用的消息、记忆和领域事实引用的不可变清单。
_Avoid_: full user history, prompt dump

**AgentEvent**:
Agent API 根据已验证的 Step、action 和状态变化创建，供 AgentRun 时间线、流式恢复和审计使用的 append-only 事件。
_Avoid_: complete event-sourced truth

**AgentRuntime**:
部署在服务端 Agent Executor 内、通过 Model/Step/Tool ports 驱动 Turn/Step loop 的框架无关深模块；不拥有 HTTP、数据库、Provider key 或 Cordis plugin tree。
_Avoid_: browser agent, model provider, NestJS replacement, local connector
