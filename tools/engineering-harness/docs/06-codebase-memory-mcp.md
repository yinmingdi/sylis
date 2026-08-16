# codebase-memory-mcp

codebase-memory-mcp 可以作为 Agent Harness 的默认代码结构发现后端候选。

它的价值在于把源码结构转换为 agent 可查询的持久知识图谱，帮助 agent 用更少 token 发现符号、调用关系、依赖关系和相似实现。

## 适合承担的职责

- 代码结构索引
- 函数、类、组件、模块定位
- 调用链查询
- 影响面分析
- 相似代码发现
- dead code 辅助分析
- 跨仓库结构查询
- 语义搜索后端

## 不应承担的职责

codebase-memory-mcp 不应该替代：

- `docs/product/domain.md` 中的领域语言。
- ADR 中的架构决策。
- skill 和项目上下文中的复用决策规则。
- Figma MCP 中的设计事实。
- skill 中的 agent 行为流程。
- 测试和截图中的完成验证。

它能告诉 agent “哪里可能相关”，但不能单独决定“是否应该复用”。

## 推荐定位

在 Harness 中，codebase-memory-mcp 应该被定位为代码发现后端：

1. 用户提出任务。
2. Agent 根据任务查询代码结构候选。
3. Agent 读取候选源码、调用点、测试和使用样例。
4. Agent 结合 `docs/product/domain.md`、`docs/architecture/`、ADR 和当前任务判断是否复用。
5. 如果找不到合适能力，再新增实现，并在必要时把复用规则沉淀到 skill、context、ADR、测试或检查脚本。

## 风险

- 工具实际效果需要在每个目标项目的真实技术栈和规模下验证。
- 生成的图谱 artifact 是否提交仓库需要单独决策。
- 不能把工具能力误当成团队工程协议。
- 如果完全依赖外部索引，可能忽略源码附近的真实语义和约束。
