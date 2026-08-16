# Concepts

## Agent Harness 工程层

让 LLM 在工程环境中可感知、可行动、可验证、可约束、可恢复、可沉淀的一套运行时工程层。

它不等同于 MCP、skill、文档或索引工具，而是把这些能力组织起来的协议。

## Capability Source / 能力源

任何能增强 agent 感知或行动能力的来源都可以是能力源，例如：

- Figma MCP
- codebase-memory-mcp
- Google/Web MCP
- GitHub MCP
- 源码
- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/product/domain.md`
- `docs/architecture/`
- ADR
- 测试、日志、截图、构建输出

能力源提供事实和工具，但不自动给出工程判断。

## Code Capability / 代码能力

代码能力是 agent 通过代码检索、相似实现、调用关系、使用样例和项目约束动态发现出来的可复用工程单元，可以是组件、函数、类、service、hook、模块模式或工作流。

推荐中文 canonical term：代码能力。

推荐英文 canonical term：Code Capability。

## Project Memory / 项目记忆

项目记忆是 agent 需要长期遵守的团队共识，包括领域语言、架构边界、历史决策、禁区、质量标准和复用规则。

它应该贴近源码和真实决策来源，避免维护一份远离代码的二手索引。

推荐形态：

- `AGENTS.md`：agent 工作入口。
- `ARCHITECTURE.md`：架构入口地图。
- `docs/product/domain.md`：领域语言。
- `docs/architecture/`：架构规则和边界。
- `docs/adr/`：稳定决策。
- `docs/design/`：设计和 Figma 规则。
- `docs/quality/`：验证、可靠性、安全和测试规则。

## Verification / 验证协议

验证协议定义什么算完成。它应该尽量依赖可执行证据，而不是 agent 的主观判断。

常见证据包括类型检查、lint、单元测试、截图、视觉比对、构建结果、路由可访问性和人工验收标准。

## Guardrails / 边界约束

边界约束让 agent 知道什么不能做、什么需要审批、什么必须先查证。

常见边界约束包括依赖方向、DTO 映射边界、设计资产处理规则、禁止无根据改动和禁止破坏用户已有改动。

## Task State / 任务状态

任务状态记录 agent 当前目标、已验证事实、未决问题、执行计划和证据。长任务如果没有任务状态，很容易重复探索或遗忘前提。

## Failure Attribution / 失败归因

失败后要先判断失败来源，而不是直接乱改。失败可能来自上下文不足、工具使用错误、设计理解错误、测试脆弱、实现缺陷、依赖环境或质量标准不清。

## Entropy Control / 熵控制

Agent 会放大坏模式：重复工具函数、过度抽象、错误术语、腐烂文档、无验证实现。熵控制要求把失败经验和人工纠正沉淀为更稳定的规则、文档、skill、测试或检查脚本。
