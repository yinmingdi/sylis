# Harness vs MCP vs Skill

这三个概念解决不同层次的问题。

## MCP

MCP 是工具和能力源协议。

它让 agent 可以访问外部系统，例如 Figma、代码索引、浏览器、Google、GitHub、数据库或内部服务。

MCP 回答的是：

- agent 可以调用什么工具？
- 工具参数是什么？
- 工具返回什么事实？

MCP 不负责完整工程判断。

## Skill

Skill 是 agent 行为流程。

它告诉 agent 在某类任务中应该按什么步骤行动，例如 Figma-to-code、诊断 bug、TDD、架构 review、issue 拆分。

Skill 回答的是：

- 这个任务类型应该怎么做？
- 先读什么，再查什么，再验证什么？
- 常见坑和禁止事项是什么？

Skill 依赖项目事实和工具能力，但不应该承载全部项目记忆。

## Harness

Harness 是工程协议层。

它把 MCP、skill、文档、代码检索、检查脚本、任务状态和验证标准组合成稳定的 agent 工作环境。

Harness 回答的是：

- agent 如何进入项目上下文？
- 项目事实在哪里？
- 哪些能力源可用？
- 什么时候该复用代码能力？
- 如何验证完成？
- 失败后如何归因和沉淀？
- 如何控制 AI 产物带来的工程熵？

## 关系

推荐关系：

- MCP 提供能力源。
- Skill 编排任务流程。
- Harness 定义工程协议、记忆、边界和验证。

一个健康的 Agent Harness 不应该把所有东西都塞进 skill，也不应该指望 MCP 自动理解项目工程文化。

## Skill 拆分原则

Skill 按任务和流程拆，不按 MCP 工具拆。

v1 必需 skill 只有两个：

- `setup-agent-harness`：初始化或更新项目 harness。
- `use-agent-harness`：日常任务入口，执行 Orient -> Retrieve -> Plan -> Act -> Observe -> Evaluate -> Learn -> Govern。

不为 Figma MCP、code memory MCP、DevTools MCP、Google MCP 分别创建厚 skill。它们应记录在 `docs/generated/tool-capabilities.md`，并由 `docs/agent-harness.md` 的 tool routing 规则决定何时使用。

当某类任务高频且触发不稳定时，v2 可以添加薄 skill，例如 `figma-to-code`、`debug-runtime`、`validate-ui`。这些薄 skill 只负责触发、强制读取相关项目文档，并进入通用 harness 流程，不承载项目事实。
