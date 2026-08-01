# 系统架构

Sylis 是 pnpm monorepo，包含 React Web、NestJS API、共享 DTO/工具包，以及按需运行的 ECDICT 导入器。

```text
Internet
   |
   v
Railway web (Caddy + React)
   |  /api/*, Railway private network
   v
Railway api (NestJS)
   |---- PostgreSQL
   |---- Redis
   |---- AI provider
   `---- SMTP provider

vocabulary-importer ---- PostgreSQL
```

Web 是唯一公网服务。Caddy 托管静态文件，并将 `/api/*` 去除前缀后转发到 `api.railway.internal:3000`。浏览器不会接触 Railway 私网地址、数据库连接串或供应商密钥。

API 负责认证、学习流程、AI、邮件、文章、聊天和词汇业务。启动时校验所有必需环境变量；`/health` 同时检查 PostgreSQL 和 Redis。生产环境不公开 Swagger。

`vocabulary-importer` 是无公网的手动作业，只获得 `DATABASE_URL`。它校验固定 ECDICT 数据的 SHA-256，通过 advisory lock 防止并发导入，并记录每次导入审计。

staging 与 production 使用独立服务、数据库、Redis 和密钥。GitHub Actions 负责质量门禁，Railway GitHub Autodeploy 在 CI 成功后发布 `develop` 或 `main`。
