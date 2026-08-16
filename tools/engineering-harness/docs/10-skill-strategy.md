# Skill 策略

本文档记录 Agent Harness 的 skill 设计策略。

核心原则：

```text
Skill 按任务和流程拆，不按 MCP 工具拆。
```

MCP 是能力源，skill 是行为入口，项目文档是事实和规则来源。不要为每个 MCP 单独创建一个厚 skill，也不要把项目规则写死在 skill 里。

## v1 必需 skill

v1 只需要两个必需 skill：

```text
setup-agent-harness
use-agent-harness
```

### `setup-agent-harness`

初始化或更新项目 harness。

职责：

- 探测项目结构、技术栈、命令、测试、工具和已有文档。
- 检测已有 agent 配置和旧项目记忆，并分类到 harness 概念。
- 检测到已有内容时，询问用户采用 Reference only、Hybrid 还是 Migrate。
- 访谈用户确认无法自动探测的偏好。
- 生成或更新 `AGENTS.md`。
- 生成或更新 `ARCHITECTURE.md`。
- 生成 `docs/agent-harness.md`。
- 生成 `docs/generated/tool-capabilities.md`。
- 生成 `docs/generated/command-registry.md`。
- 生成 `docs/generated/project-profile.md`。
- 生成 `docs/generated/harnessability-report.md`。
- 检测到已有文档或 agent 配置时，生成 `docs/generated/harness-migration-map.md`。
- 生成或补齐 `docs/product/`、`docs/architecture/`、`docs/design/`、`docs/quality/`、`docs/planning/`、`docs/references/` 的入口文件。

它回答：

```text
这个项目的 agent harness 应该如何建立？
```

### `use-agent-harness`

日常任务入口。

职责：

- 执行核心循环：Orient -> Retrieve -> Plan -> Act -> Observe -> Evaluate -> Learn -> Govern。
- 读取 `AGENTS.md` 和 `docs/agent-harness.md`。
- 根据任务类型读取相关 Guides。
- 根据 `docs/generated/tool-capabilities.md` 选择 MCP 或 fallback 工具。
- 根据 `docs/generated/command-registry.md` 执行验证命令。
- 根据 `docs/quality/verification-gates.md` 判断完成证据。
- 失败后根据 `docs/agent-harness.md` 的 Learning/Governance path 建议写回位置。

它回答：

```text
当前任务应该如何在这个项目里完成？
```

## 为什么 v1 不按 MCP 拆 skill

不推荐：

```text
figma-mcp
code-memory-mcp
devtools-mcp
google-mcp
```

原因：

- Agent 应该先理解任务，而不是先选择工具。
- 一个任务通常需要多个 MCP 协同，例如 Figma-to-code 需要 Figma MCP、代码检索和浏览器验证。
- 项目里可用的 MCP 会变化，应该记录在 `docs/generated/tool-capabilities.md`，而不是写死在 skill。
- 工具使用规则属于 `docs/agent-harness.md` 的 tool routing，不属于单个工具 skill。
- 按工具拆 skill 会导致规则重复、触发混乱和维护成本上升。

推荐：

```text
任务 -> use-agent-harness -> tool routing -> MCP/fallback
```

## MCP 在体系中的位置

MCP 作为 Capability Source / 能力源存在。

### Figma MCP

用于：

- 读取设计节点。
- 获取截图和布局事实。
- 检查组件、变量、字体、颜色、间距和导出资源。

触发场景：

- 用户提供 Figma URL。
- 用户要求根据设计稿实现。
- 用户要求还原页面、组件、样式或设计系统。

项目规则位置：

- `docs/design/figma.md`
- `docs/design/design-system.md`
- `docs/quality/verification-gates.md`

### Code Memory / Code Search MCP

用于：

- 查找相似代码。
- 查找调用链。
- 分析影响面。
- 定位相关测试。
- 发现已有实现模式。

触发场景：

- 新建组件、函数、类、service、hook、mapper、command 或页面前。
- bug 修复时需要调用链和影响面。
- refactor 时需要依赖图。
- Figma-to-code 前需要查找相似页面或组件。

项目规则位置：

- `docs/agent-harness.md`
- `docs/architecture/boundaries.md`
- `docs/generated/tool-capabilities.md`

### DevTools / Browser MCP

用于：

- 运行页面。
- 检查 DOM。
- 检查 console 和 network。
- 截图。
- 复现 runtime bug。
- 验证交互和响应式布局。

触发场景：

- UI 实现后。
- 运行时 bug。
- Figma-to-code 视觉验证。
- 用户报告浏览器行为异常。

项目规则位置：

- `docs/quality/sensors.md`
- `docs/quality/verification-gates.md`
- `docs/generated/command-registry.md`

### Google / Web / Docs MCP

用于：

- 查询外部事实。
- 查官方文档。
- 验证第三方库、浏览器 API、平台能力或时效性信息。

触发场景：

- 信息可能随时间变化。
- 涉及第三方库或外部平台。
- 用户要求搜索。
- 高风险领域需要官方来源。

项目规则位置：

- `docs/references/index.md`
- `docs/agent-harness.md`

## v2 可选薄 skill

当某类任务高频且触发不稳定时，可以新增薄 skill。

薄 skill 只做三件事：

1. 提供更准确的触发描述。
2. 强制读取相关项目文档。
3. 进入 `use-agent-harness` 的核心循环。

薄 skill 不应该承载项目事实，不应该复制项目规则。

候选：

```text
figma-to-code
debug-runtime
validate-ui
improve-harness
```

### `figma-to-code`

触发：

- Figma URL。
- 根据设计稿实现。
- UI/页面/组件还原。
- 设计系统映射。

强制读取：

- `docs/design/figma.md`
- `docs/design/design-system.md`
- `docs/quality/verification-gates.md`
- `docs/generated/tool-capabilities.md`

使用能力源：

- Figma MCP。
- Code Memory / code search。
- DevTools / Browser。

### `debug-runtime`

触发：

- 浏览器 bug。
- console error。
- network error。
- 用户可见运行时异常。

强制读取：

- `docs/quality/sensors.md`
- `docs/quality/reliability.md`
- `docs/generated/command-registry.md`
- `docs/generated/tool-capabilities.md`

使用能力源：

- DevTools / Browser。
- Code Memory / code search。
- Tests / logs。

### `validate-ui`

触发：

- 验证 UI。
- 检查截图。
- 检查 responsive。
- 检查 text overflow。
- 检查 accessibility。

强制读取：

- `docs/design/index.md`
- `docs/quality/verification-gates.md`
- `docs/quality/accessibility.md`
- `docs/quality/performance.md`

使用能力源：

- DevTools / Browser。
- Playwright / screenshot。
- Visual sensors。

### `improve-harness`

触发：

- agent 多次犯同类错误。
- 工具能力变化。
- 验证门缺失。
- 文档过期。
- setup 生成内容需要升级。

强制读取：

- `docs/agent-harness.md`
- `docs/generated/harnessability-report.md`
- `docs/planning/tech-debt.md`
- `docs/quality/sensors.md`

## 决策

v1 默认只实现：

```text
setup-agent-harness
use-agent-harness
```

v2 再根据真实使用痛点添加薄 skill。添加标准：

- 高频任务在 `use-agent-harness` 下触发不稳定。
- 用户经常用同一类自然语言描述任务。
- 该任务必须强制读取一组固定项目文档。
- 该任务需要稳定组合多个 MCP。

否则不要新增 skill。
