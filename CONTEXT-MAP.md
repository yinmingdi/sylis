# Sylis Context Map

Sylis 是包含词典、学习、测评、阅读和 AI 导师的语言学习产品。不同上下文共享稳定标识和已发布契约，但不共享可变领域对象。

## Contexts

- [Identity and Access](./docs/overview/refactor/domain/identity/CONTEXT.md) - 独立用户、认证、会话、同意和运营权限。
- [Lexicon](./docs/overview/refactor/domain/lexicon/CONTEXT.md) - 词汇身份、词义、形式、语言关系、来源和数据发布。
- [Learning and Assessment](./docs/overview/refactor/domain/learning/CONTEXT.md) - 词书、学习目标、练习、记忆调度和测评证据。
- [Reading](./docs/overview/refactor/domain/reading/CONTEXT.md) - 可版本化阅读材料、来源体验、词汇标注和阅读行为。
- [AI Tutor](./docs/overview/refactor/domain/ai/CONTEXT.md) - 在线导师、语法诊断、内容生成、模型调用和成本事实。
- [Platform Operations](./docs/overview/refactor/domain/operations/CONTEXT.md) - 构建、导入、审核、激活、部署和审计。

## Relationships

- **Identity and Access -> Learning and Assessment / Reading / AI Tutor**: `User` 是学习状态和私人内容的唯一所有者，也是认证与授权主体。
- **Lexicon -> Learning and Assessment**: Lexicon 发布不可变 `LexiconRelease`；词书、目标、教学材料、题目和测评 revision 固定到同一 release。`PedagogicalMaterial` 可以解释词典事实，但不能反向成为词典证据。
- **Lexicon -> Reading**: 阅读标注引用明确 release 内的 Entry、Sense 或 LearningObjective，不以显示文本作为身份。
- **Learning and Assessment -> Reading / AI Tutor**: 只通过稳定 query contract 暴露到期目标、表现和用户选择的上下文，不共享内部表模型。
- **Reading -> AI Tutor**: 用户显式选择的 `ReadingDocumentRevision` 可成为导师或语法诊断上下文；AI 不自动读取全部历史。
- **AI Tutor -> Lexicon / Learning and Assessment**: AI 只能产生候选、教学材料、反馈或用户内容，不能在在线请求中修改正式词典、题库或记忆事实。
- **Platform Operations -> all contexts**: 运营上下文发布 artifact、激活 release 和记录审计，但不拥有各业务上下文的领域含义。
