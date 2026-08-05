# Harness Engineering

Sylis 使用仓库级 Agent Harness，让编码代理能够从版本化项目事实出发，遵循明确边界，并以可执行证据完成验收。

## 组成

- `AGENTS.md`：短入口地图和持久工作规则。
- `ARCHITECTURE.md`：workspace 结构与依赖方向入口。
- `.harness/config.json`：生成和校验策略的机器可读事实源。
- `.harness/manifest.json`：工具包生成文件及内容哈希。
- `docs/overview/agent-harness.md`：任务循环、工具路由与学习治理协议。
- `docs/overview/generated/`：项目画像、命令、能力、迁移和 Harnessability 事实。
- `docs/overview/planning/`：可恢复的 ExecPlan 生命周期。
- `packages/harness`：通用生成器、checker、测试、assets 和可选 Skill。

`packages/harness` 中的 Skill 不会自动安装到 `.agents/skills`，也不会启用自定义代理或模型路由。当前项目只使用确定性 CLI 和生成的仓库文件。

## 常用命令

```bash
pnpm harness:init
pnpm harness:test
pnpm harness:check
pnpm build:docs
```

修改 `.harness/config.json`、workspace manifest 或生成依据后，先运行 `pnpm harness:init` 刷新事实，再运行检查。不要手工编辑 `docs/overview/generated/`；生成器检测到内容漂移时会停止并要求人工处理。

## 安全合并

生成器采用 Hybrid 策略：保留并映射已有产品、架构、测试和安全文档，只创建缺失入口。scaffold 文件生成后归项目维护者所有；generated 文件只有在当前哈希仍匹配上次生成结果时才允许刷新。

使用工具包处理其他仓库时，必须先运行 dry-run：

```bash
pnpm --filter @sylis/harness run init -- \
  --target /path/to/repository \
  --strategy hybrid \
  --docs-root docs \
  --dry-run
```

v1 不自动移动、删除或重命名已有文档，也拒绝目标目录之外的路径和 symlink 写入。

## 架构门禁

Sylis 当前允许 root、apps、services 和 docs 使用 `packages/*`；packages 可以使用其他 packages；apps、services 和 docs 之间不能互相依赖。所有内部版本必须使用 `workspace:`，并禁止重复 package 名和依赖环。

第一阶段在 workspace manifest 层执行门禁，不替代源码 lint、typecheck、单元测试或运行时验证。

## 依据维护

当前依据包括 [OpenAI Harness Engineering](https://openai.com/index/harness-engineering/)、[OpenAI ExecPlans](https://developers.openai.com/cookbook/articles/codex_exec_plans) 和固定提交的 [harness-init 设计参考](https://github.com/Gizele1/harness-init/tree/71d48b2ec74768d6bcd96afb68376e0d5c9c4fea)。

依据复核时间记录在 `.harness/config.json`：超过 120 天产生 warning，超过 180 天使检查失败。复核必须实际阅读当前来源后才能更新日期。

## ExecPlan 生命周期

多文件、长时间或存在重要决策的工作从 `docs/overview/planning/TEMPLATE.md` 创建计划，实施期间放在 `active/`，保持进度、发现、决策和验证证据持续更新；完成验收后移入 `completed/`。小型、低风险修改不要求 ExecPlan。
