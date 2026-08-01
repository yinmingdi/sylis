# 快速开始

## 环境要求

- Node.js 24
- pnpm 10.23.0
- Docker（用于 PostgreSQL 和 Redis）

## 启动

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
docker compose -f apps/api/docker-compose.yml up -d
pnpm --filter @sylis/api prisma:generate
pnpm --filter @sylis/api exec prisma migrate deploy
pnpm dev
```

Web 通过同源 `/api` 代理后端。浏览器端不需要也不允许配置 AI Key。

## 验证

```bash
curl http://localhost:3000/health
pnpm lint
pnpm --filter @sylis/api test --runInBand
pnpm --filter @sylis/web build
```

Railway 部署参见仓库根目录的 `RAILWAY_DEPLOYMENT.md`。
