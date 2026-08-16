# Open Questions

这些问题暂时保留，不在当前文档型包阶段过早决定。

## codebase-memory graph artifact 是否提交

codebase-memory-mcp 支持团队共享图谱 artifact。需要评估：

- 文件体积
- 更新频率
- 是否影响代码 review
- 是否包含敏感信息
- 是否真的显著降低首次索引成本

## 是否需要额外人工标注代码能力

v1 默认不需要。

代码能力通过 codebase-memory-mcp、源码搜索、调用关系、测试和使用样例动态发现。复用判断由 skill、context、ADR 和验证协议约束。

只有当检索误判长期无法通过 skill/context/check 解决时，才重新评估是否需要轻量标注。

## 通用 skills pack 的分发时机

v1 已决定在 workspace 内保持 private，同时确保配置、脚本、assets 和 tests 不依赖 Sylis 固定路径。是否发布 npm 或抽离独立仓库留到真实跨仓库使用验证之后决定。

v1 方向：

- setup skill
- harness usage skill
- format contract 文档

v2 只有在高频任务触发不稳定时，再考虑薄 skill：

- Figma-to-code skill
- runtime debug skill
- UI validation skill
- harness improvement skill

## Figma 视觉验证是否固定为 quality gate

对 Figma-to-code 任务，是否强制 Playwright 截图、Figma 截图对照和布局检查，需要根据成本决定。

可能策略：

- 简单静态页面：截图验证必选。
- 小组件：截图可选，但必须检查文本溢出和布局稳定。
- 医学影像工作台页面：截图和关键区域布局检查必选。

## 是否引入自动推荐代码能力

短期不做复杂自动推荐。优先使用 codebase-memory-mcp 做候选发现，用 skill、context、ADR、测试和真实使用样例做复用判断。

只有当手动查询成本仍然过高时，再考虑 embedding、排序模型或复杂 UI 面板。
