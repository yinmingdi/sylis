# 贡献指南

## 开始之前

先阅读仓库根目录 `AGENTS.md`、`ARCHITECTURE.md` 和相关 bounded-context 文档。代码的
owner、同步 API、executor、数据库表和 package 边界以这些文档和可执行架构门禁为准。

开发环境固定使用 Node.js `24.19.0`、pnpm `10.23.0` 和 Turborepo：

```bash
git clone https://github.com/your-account/sylis.git
cd sylis
corepack enable
pnpm install --frozen-lockfile
```

## 分支流程

从 protected `main` 创建短期分支，并只向 `main` 提 Pull Request：

```bash
git remote add upstream https://github.com/OWNER/sylis.git
git switch main
git pull --ff-only upstream main
git switch -c feature/your-change
```

项目不使用 `develop` 或 `release/*`。green `main` 自动部署 staging；production 由维护者
通过 protected release workflow 提升同一批不可变 image digest。完整规则见
[Trunk-based 分支与发布](./gitflow.md)。

## 实现规则

- 使用领域文档中的 ubiquitous language；受控状态和类型使用 enum。
- TypeScript 源码 import 省略 `.js`、`.ts` 等后缀。
- 前端遵守 `app/pages/modules` 边界；共享 UI primitive 放 `@sylis/components`，跨
  runtime 且无 I/O 的纯函数才放 `@sylis/utils`。
- 后端按 owner module 组织。跨 app 通过生成 client、typed contract 和 HTTP/Job
  protocol 协作，不相对导入另一个 app，也不直接写另一个 owner 的表。
- Provider credential 和模型正文不得进入浏览器、日志、OpenAPI、词典 artifact 或
  Git。真实模型调用不得进入普通测试。
- 数据库结构只由 `@sylis/database` 拥有；Prisma 无法表达的不变量写入 committed
  migration SQL 并增加数据库级验证。
- 不引入 Nx、tsup、tsdown、generic Worker、`shared` 聚合包或 phase-numbered 命令。

## 验证

在实现中可以运行窄范围诊断；提交前必须完成与风险相称的验证。完整重构或共享契约
变更按 [验证门禁](../quality/verification-gates.md) 和
[E2E 拓扑](../refactor/delivery/monorepo-e2e-topology.md) 执行。开始的基本检查为：

```bash
pnpm format:check
pnpm architecture:check
pnpm workflows:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

涉及 public UI/HTTP、数据库 migration、跨服务 Job 或 Model Gateway 的变更必须补充
相应 E2E。完整验收的最后一条命令是根目录 `pnpm e2e`，并等待它真正结束。

## Pull Request

PR 标题使用 Conventional Commits，例如 `feat(agent): add typed proposal approval`。
描述应包含：问题与边界、关键设计决定、用户可见行为、数据库/安全影响、实际执行的
验证命令和结果。UI 变更附 desktop/mobile 截图；API 或数据契约变更同步更新生成文件
和架构文档。

不要把“命令已启动”当作通过，也不要通过降低门禁、跳过 required checks 或手工改
Railway source 来处理失败。定位根因、修复受影响实现，再重新运行相关检查。
