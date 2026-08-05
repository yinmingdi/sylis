# Overview

Agent Harness 工程层的目标不是创建又一个工具，而是把 LLM 在真实工程环境中缺失的上下文、工具、约束和反馈机制组织起来。

Figma MCP、codebase-memory-mcp、Google MCP、GitHub MCP、源码、`AGENTS.md`、`ARCHITECTURE.md`、结构化 `docs/`、ADR、测试和日志都可以成为 agent 的能力源。但单个能力源只解决一部分问题：

- Figma MCP 让 agent 看到设计稿，但不保证代码复用、视觉验证或工程边界。
- codebase-memory-mcp 让 agent 查询代码结构，但不表达业务语义、复用契约或设计意图。
- Google/Web MCP 让 agent 获取外部事实，但不代表这些事实适合当前项目。
- 文档能表达团队共识，但容易腐烂，且不能自动完成结构定位和验证。

因此，Agent Harness 应该是位于模型和工程系统之间的运行时工程层。它把各种能力源组织成一套可重复的流程，让 agent 能够感知、定位、决策、行动、反馈、归因、验证、沉淀，并控制工程熵。

## 核心判断

MCP 是能力源和工具协议，不是完整工程体系。

Skill 是 agent 行为流程，不是项目事实本身。

Harness 是把能力源、项目记忆、行为流程、验证协议和质量边界连接起来的工程协议层。

## 对目标项目的意义

真实工程项目通常存在明确的领域语言、分层边界、设计还原要求和复杂复用点。Agent Harness 需要帮助 agent：

- 遵守 `docs/product/domain.md`、`docs/architecture/` 和 ADR 中已有的领域边界。
- 不把底层传输或存储概念泄漏到不合适的层级。
- 在基于 Figma 实现页面前先寻找已有代码能力。
- 在复用组件、函数、类和服务时理解它们的适用边界。
- 在失败后把人工纠正沉淀为更稳定的规则。
