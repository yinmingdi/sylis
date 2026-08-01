# 配置与密钥

## API 环境变量

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sylis
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-at-least-32-random-characters
JWT_EXPIRES_IN=30d
AI_API_KEY=replace-with-provider-key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=replace-with-enabled-model
MAILER_HOST=smtp.example.com
MAILER_PORT=587
MAILER_SECURE=false
MAILER_USER=replace-with-smtp-user
MAILER_PASS=replace-with-smtp-app-password
MAILER_FROM=Sylis <no-reply@example.com>
```

Reddit 集成可选；`REDDIT_CLIENT_ID` 与 `REDDIT_CLIENT_SECRET` 必须同时配置。

## Web 配置

Web 使用同源 `/api`，生产运行时只有 Caddy 的 `API_UPSTREAM`。禁止使用 `VITE_*KEY`、`VITE_*SECRET` 或在前端保存供应商凭据，因为所有 `VITE_*` 值都会进入浏览器包。

## Railway

staging 和 production 必须使用独立 PostgreSQL、Redis、JWT、AI 与 SMTP 凭据。数据库和 Redis 使用 Railway 服务变量引用；其余秘密使用环境级 sealed variables。GitHub Actions 只使用测试占位值，不保存 Railway Token 或任何生产密钥。

详细步骤参见仓库根目录的 `RAILWAY_DEPLOYMENT.md`。
