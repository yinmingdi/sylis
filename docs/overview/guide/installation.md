# 安装指南

## 工具链

项目固定使用 Node.js 24 和 pnpm 10.23.0：

```bash
corepack enable
corepack prepare pnpm@10.23.0 --activate
pnpm install --frozen-lockfile
```

## 本地依赖

```bash
docker compose -f apps/api/docker-compose.yml up -d
cp apps/api/.env.example apps/api/.env
```

填写后端 `.env` 中的 PostgreSQL、Redis、JWT、AI 和 SMTP 配置。JWT 至少 32 个字符；AI 与 SMTP 使用开发环境专用凭据。

```bash
pnpm --filter @sylis/api prisma:generate
pnpm --filter @sylis/api exec prisma migrate deploy
pnpm dev
```

前端始终请求 `/api`，无需创建 Web `.env`。不要向任何 `VITE_*` 变量写入密钥。

## 生产构建

```bash
pnpm --filter @sylis/utils build
pnpm --filter @sylis/api build
pnpm --filter @sylis/web build
```

生产环境不运行 `prisma seed`。词库使用独立的 `@sylis/vocabulary-importer` 服务按需导入。
