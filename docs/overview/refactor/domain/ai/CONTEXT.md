# AI Tutor

本上下文描述面向用户的受控学习导师与可审计生成任务，不拥有正式词典事实或学习评分真相。

## Language

**TutorSession**:
User 与学习导师围绕显式上下文进行的连续会话。
_Avoid_: generic chat, ChatSession

**TutorMessage**:
TutorSession 中由学习者、导师或工具产生的一条版本化消息。
_Avoid_: prompt row

**GrammarDiagnosis**:
针对一段用户文本产生的结构化语法观察、证据和建议。
_Avoid_: grammar score

**ReadingGeneration**:
User 请求生成一份阅读材料的领域事实；执行状态由关联的 BackgroundJob 持有。
_Avoid_: provider request, generic generation execution row

**PromptTemplate**:
具有稳定标识、版本和输出契约的模型指令。
_Avoid_: prompt string

**ModelInvocation**:
一次携带 provider、模型、输入证据、成本和结果状态的外部模型调用事实。
_Avoid_: API log

**AIUsageLedger**:
按 User、能力和预算窗口记录的 AI 用量事实。
_Avoid_: token counter

**GeneratedCandidate**:
AI 提出的、尚未通过相应领域发布门禁的候选内容。
_Avoid_: generated fact
