# 开发规范

Sylis 的工程规范由可执行边界和重构文档共同定义。本页只提供稳定入口，避免复制一份会与代码漂移的目录、技术栈或环境变量清单。

## 工具与目录

- 只使用 Node.js 24、pnpm 10.23.0 和 Turbo；不使用 npm lockfile、Yarn、Nx 或全局任务编排脚本。
- Workspace、package exports、允许依赖和 Turbo task 见 [Workspace 项目图](../refactor/implementation/workspace-projects.md)。
- User/Admin 前端的 `app/pages/modules` 边界见 [前端目录](../refactor/implementation/frontend-structure.md)。共享 UI 只进入 `@sylis/components`，跨运行时纯函数只进入 `@sylis/utils`。
- API 使用 NestJS module-first 目录；executor、Lexicon Builder 和 Lexicon Publisher 都是职责明确的独立 composition root，见 [后端目录](../refactor/implementation/backend-structure.md)。

## 代码规则

- TypeScript 本地 import 使用 extensionless specifier；不要在源码 import 中追加 `.js`。
- 新代码保持严格类型，禁止用聚合 `shared` package 绕过 owner 边界。
- Prisma schema、SQL-only database invariants 和 client 只由 `@sylis/database` 拥有；业务 repository 留在对应 API module 或 executor。
- 用户 API 使用 `/api/v1`，管理 API 使用 `/api/admin/v1`；两套 OpenAPI snapshot 和 generated client 不能交叉 import。
- 用户私有正文先验证有效 Consent，再以字段级 envelope encryption 存储；日志、错误、OpenAPI、浏览器 bundle 和 JSON artifact 不得包含正文或 secret。
- 所有长任务使用 `@sylis/job-contracts` 与 `@sylis/job-runtime`；PostgreSQL 是状态真相，Redis 只负责唤醒。
- Compiler package 只解析、合并、生成候选和输出标准 artifact，不连接生产数据库；Lexicon Publisher 不解析来源、不调用 AI、不自动激活 release。

## 变更与验收

实现按 [一次性绿地迁移顺序](../refactor/delivery/migration.md) 推进。开始修改前检索相似代码和 owner，保持改动在领域边界内；全部结构完成后按 [测试矩阵](../refactor/delivery/testing.md) 与 [验证门禁](../quality/verification-gates.md) 收集完整证据。

短期 `feature/*` 分支合入 protected `main`；green `main` 自动部署 staging，手工 `v0.0.1` release 再提升同一批 digest 到 production。部署只消费 required CI 已验证的不可变 GHCR digest，详见 [CI/CD、Railway 与密钥](../refactor/delivery/cicd-security.md)。
