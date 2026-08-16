# Sylis Context Map

Sylis 是包含词典、学习、测评、阅读和 Learning Agent 的语言学习产品。上下文共享稳定标识和已发布契约，但不共享可变领域对象。

## Contexts

- [Identity and Access](./docs/overview/refactor/domain/identity/CONTEXT.md) - 独立 User、认证凭据、会话、同意和访问授权。
- [Lexicon](./docs/overview/refactor/domain/lexicon/CONTEXT.md) - 词汇身份、词义、形式、语言关系、来源和数据发布。
- [Learning and Assessment](./docs/overview/refactor/domain/learning/CONTEXT.md) - 词书、学习目标、练习、记忆调度和测评证据。
- [Reading](./docs/overview/refactor/domain/reading/CONTEXT.md) - 可版本化阅读材料、来源体验、词汇标注和阅读行为。
- [Learning Agent](./docs/overview/refactor/domain/agent/CONTEXT.md) - 通用学习代理、受控工具、生成内容、记忆和计划。
- [Model Execution](./docs/overview/refactor/domain/model-execution/CONTEXT.md) - Provider 路由、凭证、permit、调用、交换、用量和健康。
- [Content Assets](./docs/overview/refactor/domain/content-assets/CONTEXT.md) - 文件 identity/revision、quarantine、派生内容和删除。
- [Platform Operations](./docs/overview/refactor/domain/operations/CONTEXT.md) - Job、构建、导入、审核、激活、部署和审计。

## Relationships

- **Identity and Access -> Learning / Reading / Learning Agent**: `User` 是学习状态和私人内容的唯一所有者；`api` 签发 audience-restricted AccessGrant。
- **Lexicon -> Learning**: Lexicon 发布不可变 `LexiconRelease`；词书、目标、教学材料、题目和测评 revision 固定到同一 release。
- **Lexicon -> Reading**: 阅读标注引用明确 release 内的 Entry、Sense 或 LearningObjective，不以显示文本作为身份。
- **Learning -> Reading / Learning Agent**: 只通过稳定 query contract 暴露到期目标、表现摘要和 User 显式选择的上下文。
- **Reading -> Learning Agent**: User 显式选择的 `ReadingDocumentRevision` 可进入 ContextSnapshot；Agent 不自动读取完整历史。
- **Learning Agent -> Model Execution**: Agent Run 固定 exact route/credential revision，并以一次性 ModelExecutionPermit 执行调用；一个 AgentRunStep 引用一个 ModelInvocation，Model Gateway 只返回 ordered content blocks，不推进 Agent 状态或解释 control tool。
- **Content Assets -> Learning Agent / Reading**: 只有 READY 的精确 ContentAssetRevision 可作为上下文或正式 typed command 输入。
- **Learning Agent -> Lexicon / Learning**: Agent 只能产生 Artifact、Proposal、私人练习或缺口报告，不能直接修改正式词典、题库、测评或 FSRS 真相。
- **Platform Operations -> all contexts**: Operations 提供 Job/JobAttempt 执行协议、发布和审计，但不拥有各业务上下文的领域含义。
