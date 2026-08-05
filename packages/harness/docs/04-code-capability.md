# Code Capability

代码能力是 agent 通过检索动态发现、判断、复用的工程单元。

它不是业务 Resource，也不是 UI 资产，也不是静态文件资产。它不是一份需要人类额外维护的标注清单，而是 agent 在任务中从代码结构、相似实现、调用关系、使用样例、测试和项目上下文中识别出来的可复用能力。

## 为什么使用明确术语

许多项目已经在产品、文件或基础设施领域使用 asset/resource。为了避免概念污染，本工具包统一使用：

- 中文：代码能力
- 英文：Code Capability

## 代码能力可以是什么

- UI 组件
- 页面片段
- hook
- 函数
- class
- service
- DI token
- mapper
- repository
- module pattern
- command
- validation rule
- Figma-to-code workflow

## 代码能力需要判断什么

结构索引能告诉 agent “哪里可能相关”，但不能单独决定“是否应该复用”。agent 需要结合检索结果和项目规则判断：

- 候选实现是否语义相同。
- 候选实现是否处于正确层级。
- 复用是否会违反依赖方向。
- 是否只是视觉相似但业务不同。
- 是否已有测试或真实使用样例。
- 是否需要改造已有能力而不是复制。
- 不复用时原因是什么。

## 推荐方向：检索协议优先

v1 不要求团队维护 TSDoc Code Capability，也不维护独立的代码能力清单。

原因：

- 独立标注容易腐烂。
- 开发者很难提前预测哪些代码未来会被 agent 复用。
- codebase-memory-mcp、Sourcegraph、LSP、AST 和全文搜索更适合承担发现职责。
- “该不该复用”的判断应该由 skill、项目上下文、ADR 和验证结果共同约束。

## 与 codebase-memory-mcp 的关系

codebase-memory-mcp 适合做默认代码检索后端。

Harness skill 负责规定检索和复用决策流程：

1. 创建新组件、函数、类、service、hook、mapper、command 或页面结构前，必须先检索相似实现。
2. 检索候选后，读取真实源码、调用点、测试和使用样例。
3. 结合项目上下文和 ADR 判断是否复用。
4. 如果不复用，记录原因：层级不对、语义不同、依赖不合理、行为缺失或视觉不匹配。
5. 如果反复出现同类误判，把规则沉淀到 skill、context、ADR、测试或检查脚本。
