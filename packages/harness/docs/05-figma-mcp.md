# Figma MCP

Figma MCP 是设计能力源。它让 agent 能读取设计节点、截图、样式、变量、组件信息和导出资源。

但 Figma MCP 不等于 Figma-to-code 的完整方案。它需要被 Agent Harness 约束。

## 已识别痛点

### 行高缺失导致失真

Figma 设计稿中可能没有显式行高，或者 MCP 输出没有足够可靠的 line-height 信息。直接照抄会导致文本垂直位置、按钮高度和布局密度失真。

Harness 需要定义默认补偿策略：

- 优先读取明确 line-height。
- 缺失时根据字体大小、组件高度和项目 typography 规则推断。
- 对医疗影像工作台类 UI，避免夸张的营销页字号和松散行距。
- 实现后用截图验证文本是否溢出或错位。

### SVG 不应无脑内联

Figma MCP 可能把 SVG 直接绘制到页面里，但工程实现需要判断它的语义：

- 如果是图标，优先映射到已有 icon 组件或图标包。
- 如果是装饰性矢量，应该放在合适的布局层，不应破坏内容结构。
- 如果是真实业务图像或截图，应作为图片资源处理。
- 如果是复杂医学影像或 3D 场景占位，应优先还原容器和状态，不把 Figma 矢量当真实渲染结果。

### 设计组件复用不等于代码组件复用

Figma 组件和代码组件可能不同步。Agent 实现页面前应该：

1. 读取 Figma 结构和截图。
2. 查询已有代码能力。
3. 判断是否有可复用组件、函数、类或服务。
4. 只在没有合适能力时新增实现。

## 推荐 workflow

1. 优先使用具体 Figma node，不直接选择超大 page/frame。
2. 用 Figma MCP 获取 design context。
3. 需要 token fidelity 时，显式请求 variables、styles、component names 和相关值。
4. 获取 screenshot 作为视觉基准。
5. 只在必要时下载 assets。
6. 识别页面结构、关键区域、文本、图标、状态和交互表面。
7. 用 codebase-memory-mcp 或源码搜索寻找已有代码能力。
8. 读取候选代码的真实使用样例、测试和项目约束。
9. 将 Figma MCP 输出翻译为项目框架、组件和样式约定，而不是照搬 MCP 生成代码。
10. 用项目样式规范实现 UI。
11. 用浏览器、截图或 Playwright 验证还原质量。
12. 把新发现的规则沉淀回 harness 文档或 skill。

## 官方最佳实践落地

setup 模板中的 `docs/design/figma.md` 应包含这些默认规则：

- 结构化 Figma 文件：语义命名、组件、variables/styles、Auto Layout、annotations、dev resources。
- Prompt 中显式提供框架、样式系统、目标文件、现有组件偏好和验证要求。
- 必要时显式触发 design context、variables/styles、screenshot、asset download。
- 避免大 frame，优先选择组件、section、panel、modal 或局部区域。
- 使用 Code Connect 或设计组件名作为代码复用信号，但仍需通过代码检索验证。
- 完成后必须用 rendered UI evidence 校验，而不是只相信 MCP 输出。
