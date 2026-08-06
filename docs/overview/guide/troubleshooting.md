# 故障排查

## API 无法启动

确认 `apps/api/.env` 包含 `.env.example` 中的全部必需变量。重点核对数据库、session/CSRF、内容加密和 origin 配置；API 不需要 runtime/compiler AI 密钥。

```bash
pnpm --filter @sylis/api build
pnpm --filter @sylis/api start:prod
```

## 数据库或 Redis 不健康

```bash
curl --fail http://localhost:3000/health/live
curl --fail http://localhost:3000/health/ready
pnpm --filter @sylis/database exec prisma migrate status --schema prisma/schema
```

`/health/ready` 返回非 2xx 时说明 API 尚未具备接流量条件，但不会输出连接串或密钥。

## Web 无法访问 API

本地开发由 Vite 将 `/api` 代理到 `localhost:3000`。Railway 由 Caddy 使用 `API_UPSTREAM=http://api.railway.internal:3000`。不要配置前端 AI Key 或浏览器可见的私网地址。

## Railway 发布未触发

在 GitHub Actions 检查 `CI required`、六镜像构建和目标 environment 的 deploy jobs。Railway 不使用 GitHub source autodeploy 或 `Wait for CI`；Actions 必须先推送 GHCR image，再把每个 service 切到该 commit 的不可变 digest。Railway Deployments 页面应显示与 workflow summary 相同的 deployment ID。

## Lexicon Importer 失败

不要绕过 artifact schema、双 hash、引用闭包或 release 校验。通过 Job progress 确认失败阶段，并检查 Importer `/data/lexicon-importer/work` Volume 和对象存储读凭据。失败详情记录在 `BackgroundJob`、checkpoint 与 Import Job 中；日志不得包含数据库或对象存储凭据。
