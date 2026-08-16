# Setup 产出目录结构

本文档记录 `setup-agent-harness` 应该在用户项目里生成的目标目录结构。

这个结构优先符合真实工程项目的组织方式，而不是直接把 Harness Engineering 的理论概念作为目录名。Guides、Sensors、Tool Capabilities、Generated Facts、Harnessability、Learning/Governance 这些 harness 概念会被映射到正常工程文档中，让结果同时适合人类和 agent 使用。

## 目标结构

```text
.harness/
  config.json
  manifest.json

AGENTS.md
ARCHITECTURE.md

docs/
  product/
    index.md
    domain.md

  architecture/
    index.md
    boundaries.md

  adr/
    index.md

  design/
    index.md
    design-system.md
    figma.md
    interaction.md

  quality/
    index.md
    verification-gates.md
    sensors.md
    testing.md
    reliability.md
    security.md
    accessibility.md
    performance.md

  planning/
    active/
    completed/
    tech-debt.md

  generated/
    project-profile.md
    tool-capabilities.md
    command-registry.md
    harnessability-report.md
    harness-migration-map.md

  references/
    index.md

  agent-harness.md
```

## `.harness/`

仓库级机器可读配置和生成状态。

- `config.json` 定义文档根目录、采用策略、工作区边界、能力声明和来源复核期限。
- `manifest.json` 记录生成器管理的文件、所有权类型和内容哈希，用于幂等刷新与冲突检测。

## 根目录文件

### `AGENTS.md`

Agent 入口地图。

它应该保持简短，只负责把 agent 指向正确的项目记忆、命令、工具和验证规则，不应该变成大型手册。

它回答：

- Agent 应该从哪里开始？
- 常见任务类型应该先读哪些文档？
- 命令、工具能力和质量门记录在哪里？
- 哪些动作禁止执行，哪些动作需要确认？

### `ARCHITECTURE.md`

架构入口地图。

它提供系统的高层视图，包括主要模块、职责边界、依赖方向和重要架构约束。详细架构记录放在 `docs/architecture/` 中。

它回答：

- 系统由哪些主要部分组成？
- 数据和依赖如何流动？
- 哪些边界不能跨越？
- 详细架构决策在哪里？

## `docs/product/`

产品目标和行为规格。

这个目录记录产品应该做什么、为什么做、服务谁，以及用户可见功能应该具备哪些行为。

### `docs/product/index.md`

产品记忆入口。

它应该链接到产品规格、功能 brief、用户旅程、验收标准和重要产品约束。

它回答：

- 产品试图达成什么目标？
- 用户是谁？
- 功能应该暴露什么行为？
- 哪些产品取舍最重要？

### `docs/product/domain.md`

领域语言入口。

它记录项目中 agent 和人类必须使用的 canonical terms、业务生命周期、命名禁区，以及外部 raw vocabulary 到项目语言的翻译规则。

它替代旧式根级 `CONTEXT.md`，避免一个大上下文文件同时承担产品、架构、设计和质量职责。

## `docs/architecture/`

具体架构规则和架构决策。

这个目录承载 `ARCHITECTURE.md` 背后的详细工程结构。

### `docs/architecture/index.md`

架构文档索引。

它应该链接到系统图、模块职责、数据流说明、依赖规则和架构决策。

### `docs/architecture/boundaries.md`

架构边界规则。

它记录分层边界、import 规则、ownership 规则、API 边界，以及新增代码应该放在哪里。

它回答：

- 新代码应该放在哪里？
- 哪些依赖是允许的？
- 哪些概念不能跨层泄漏？
- 共享代码应该如何提升或隔离？

## `docs/adr/`

架构决策记录。

这个目录存放 Architecture Decision Records，用于保存不应该被随意推翻的重要架构决策。每条 ADR 应该说明背景、决策、后果，以及必要的迁移说明。

### `docs/adr/index.md`

ADR 索引。

它应该列出当前项目的重要架构决策，并说明是否仍然有效、被替代或已废弃。

## `docs/design/`

体验、交互、视觉设计和设计系统记忆。

这个目录关注用户体验和设计实现。它避免使用容易混淆的 `design-docs` 命名，因为 design docs 也可能表示系统设计文档。

### `docs/design/index.md`

设计记忆入口。

它应该链接到设计系统规则、Figma 使用规则、交互指南、响应式规则、视觉语言和文案风格。

### `docs/design/design-system.md`

设计系统规则。

它描述 tokens、组件、字体、间距、颜色、图标使用和允许的视觉 primitives。

它回答：

- 哪些设计 primitives 应该复用？
- tokens 如何映射到代码？
- 哪些视觉决策不应该重新发明？

### `docs/design/figma.md`

Figma-to-code 规则。

它描述 agent 和人类应该如何使用 Figma MCP、截图、导出资源、组件、字体、SVG、图标和布局测量。

它回答：

- 什么时候应该使用 Figma MCP？
- Figma 组件如何映射到代码候选实现？
- 缺失行高、图标和 SVG 应该如何处理？
- 基于 Figma 实现后需要什么证据？

### `docs/design/interaction.md`

交互和可用性规则。

它从用户体验角度描述交互模式、键盘行为、焦点行为、响应式行为、加载状态、空状态和错误状态。

## `docs/quality/`

质量标准、验证门和反馈传感器。

这个目录故意比 `verification/` 更宽。Verification 只是 quality 的一部分；quality 还包括可维护性、可靠性、安全、可访问性和性能。

### `docs/quality/index.md`

质量入口。

它应该链接到验证门、可用 sensors、测试策略和横切质量约束。

### `docs/quality/verification-gates.md`

按任务类型定义完成证据。

它定义一项工作在被认为完成之前必须具备什么证据。

示例：

- 功能开发：focused tests 和相关验证。
- Bug 修复：复现证据和回归证据。
- UI 工作：页面可渲染、截图、console 检查，必要时包含响应式检查。
- 重构：行为保持的测试和受影响检查。

### `docs/quality/sensors.md`

反馈传感器注册表。

它对 agent 和人类可用的 sensors 做分类。

Sensor 类别：

- Computational sensors：typecheck、lint、tests、build、import-boundary checks。
- Runtime sensors：browser console、network、logs、traces。
- Visual sensors：screenshots、visual diffs、responsive checks、text overflow checks。
- Inferential sensors：AI review、semantic review、human review。

### `docs/quality/testing.md`

测试策略。

它描述测试分层、测试命令用法、测试数据约定、什么时候应该新增测试，以及不同测试证明哪类行为。

### `docs/quality/reliability.md`

可靠性规则。

它描述错误处理、fallback、retry、timeout、loading state、degraded mode、logging、observability 和 recovery path。

### `docs/quality/security.md`

安全规则。

它描述认证、授权、secret 处理、输入校验、XSS/CSRF、日志脱敏、隐私和依赖风险规则。

### `docs/quality/accessibility.md`

可访问性规则。

它描述键盘支持、焦点管理、ARIA、contrast、reduced motion、screen reader 预期和可访问性验证。

### `docs/quality/performance.md`

性能规则。

它描述性能预算、bundle、渲染性能、缓存、长任务、网络行为和 profiling 预期。

## `docs/planning/`

执行计划和长期工程状态。

这个目录让 agent 能够在不依赖聊天历史的情况下恢复长任务上下文。

### `docs/planning/active/`

进行中的计划。

每个 active plan 应该记录目标、当前状态、已做决策、剩余工作、验证证据和开放风险。

### `docs/planning/completed/`

已完成计划。

已完成计划保留为历史上下文，帮助未来 agent 理解系统为什么变成现在这样。

### `docs/planning/tech-debt.md`

技术债跟踪。

它记录已知债务、影响、优先级、负责人，以及建议的修复路径。

## `docs/generated/`

生成的或 setup 探测出来的项目事实。

这些文件描述当前项目状态，可以由 setup/update skill 或脚本刷新。它们不应该和人类维护的长期规则混在一起。

### `docs/generated/project-profile.md`

项目画像。

它记录探测到的框架、包管理器、构建工具、测试框架、样式方案、目录形态、语言/运行时版本和重要入口。

### `docs/generated/tool-capabilities.md`

工具能力注册表。

它记录当前可用的 MCP servers、代码搜索工具、浏览器工具、issue tracker 和 fallback 工具。

它回答：

- Figma MCP 是否可用？
- codebase-memory 或 Sourcegraph 是否可用？
- browser/DevTools/Playwright 是否可用？
- web/docs search 是否可用？
- 主工具缺失时应该使用什么 fallback？

### `docs/generated/command-registry.md`

命令注册表。

它记录项目真实可运行的 install、dev、build、lint、typecheck、unit test、e2e test、visual test、Storybook 和其他相关检查命令。

### `docs/generated/harnessability-report.md`

Harnessability 报告。

它评估当前项目有多适合被 agent harness 控制。

它应该报告已有和缺失的 guides、sensors、commands、tool integrations、validation coverage、generated facts 和 governance paths。

它回答：

- 哪些 guides 已存在？
- 哪些 sensors 已存在？
- 哪些验证路径薄弱或缺失？
- 哪些工具不可用？
- Agent 的自我纠正最可能在哪里失败？

### `docs/generated/harness-migration-map.md`

Harness 迁移映射表。

当 setup 检测到已有文档、旧 agent 配置或类似结构时，必须生成这个文件。

它记录：

- 已有文件路径。
- 分类结果。
- 对应的 harness 概念。
- 用户选择的接入策略。
- 新结构中的目标路径或引用方式。
- 备注和风险。

可选接入策略：

- Reference only：只引用，不移动文件。
- Hybrid：保留旧路径，同时创建新入口/index 引用旧内容。默认推荐。
- Migrate：移动或重命名文件，需要用户明确确认。

## `docs/references/`

稳定外部参考。

这个目录保存 agent 经常需要的外部知识指针或 LLM-friendly 摘要。

### `docs/references/index.md`

参考资料索引。

它应该链接到框架文档、平台文档、设计系统参考、部署文档、内部 API 文档和官方外部文档。

## `docs/agent-harness.md`

Agent 运行时协议。

这个文件解释 agent 应该如何把项目记忆、工具、sensors 和生成事实串成控制闭环。

它应该定义：

- 核心循环：Orient -> Retrieve -> Plan -> Act -> Observe -> Evaluate -> Learn -> Govern。
- Guides：行动前应该使用哪些项目文档进行前馈引导。
- Sensors：行动后应该使用哪些反馈机制观察结果。
- Tool routing：什么时候使用 Figma MCP、代码搜索、browser/DevTools、web/docs search、shell 和 issue tracker。
- Self-correction：sensor 失败后如何响应。
- Learning path：重复失败、缺失规则和人工纠正应该写回哪里。
- Governance path：如何防止文档过期、重复实现、检查薄弱和工具漂移。

它回答：

- Agent 应该如何决定读什么？
- Agent 应该如何决定用什么工具？
- Agent 应该如何验证工作？
- Agent 应该如何把失败转化为更好的 guides 或 sensors？

## Harness 概念映射

目录结构使用正常工程命名，`agent-harness.md` 负责把这些工程文档映射到 harness 概念。

```text
Guides:
  AGENTS.md
  ARCHITECTURE.md
  docs/product/
  docs/architecture/
  docs/design/
  docs/quality/
  docs/references/

Sensors:
  docs/quality/sensors.md
  docs/quality/verification-gates.md
  docs/generated/command-registry.md
  browser/devtools output
  test/lint/typecheck/build output

Tool capabilities:
  docs/generated/tool-capabilities.md

Generated project facts:
  docs/generated/

Harnessability report:
  docs/generated/harnessability-report.md

Learning and governance:
  docs/planning/
  docs/agent-harness.md
  docs/quality/
```
