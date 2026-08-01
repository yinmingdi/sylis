# 故障排查

## API 无法启动

确认 `apps/api/.env` 包含 `.env.example` 中的全部必需变量。`JWT_SECRET` 至少 32 个字符，AI 与 SMTP 配置不能为空。

```bash
pnpm --filter @sylis/api build
pnpm --filter @sylis/api start:prod
```

## 数据库或 Redis 不健康

```bash
docker compose -f apps/api/docker-compose.yml ps
curl --fail http://localhost:3000/health
pnpm --filter @sylis/api exec prisma migrate status
```

`/health` 返回非 2xx 时会指出 `database` 或 `redis` 为 `down`，但不会输出连接串。

## Web 无法访问 API

本地开发由 Vite 将 `/api` 代理到 `localhost:3000`。Railway 由 Caddy 使用 `API_UPSTREAM=http://api.railway.internal:3000`。不要配置前端 AI Key 或浏览器可见的私网地址。

## Railway 发布未触发

检查目标分支的 `CI / Build and test`、`CI / Secret scan` 和 GitFlow 状态是否成功，并确认 Railway 服务启用了 `Wait for CI`。Importer 默认关闭自动部署，需要手动运行。

## ECDICT 导入失败

Checksum 不匹配时不要绕过校验。确认数据来自固定 commit，且没有另一个导入任务持有 PostgreSQL advisory lock。失败详情记录在 `DictionaryImportRun`，日志不会包含数据库凭据。
