# 故障排查

## API 无法启动

确认 `apps/backends/api/.env` 包含 `.env.example` 中的全部必需变量。重点核对数据库、session/CSRF、内容加密和 origin 配置；API 不需要 Provider AI 密钥。

```bash
pnpm --filter @sylis/api build
pnpm --filter @sylis/api start:prod
```

## 数据库或 Redis 不健康

```bash
curl --fail http://localhost:3000/health/live
curl --fail http://localhost:3000/health/ready
pnpm --filter @sylis/database prisma:validate
pnpm --filter @sylis/database invariants:check
```

`/health/ready` 返回非 2xx 时说明 API 尚未具备接流量条件，但不会输出连接串或密钥。

## Web 无法访问 API

本地开发由 Vite 将 `/api` 代理到 `localhost:3000`。Railway 由 Caddy 使用 `API_UPSTREAM=http://api.railway.internal:3000`。不要配置前端 AI Key 或浏览器可见的私网地址。

## Railway 发布未触发

在 GitHub Actions 检查 `CI required`、十二镜像构建和目标 environment 的 deploy jobs。Railway 不使用 GitHub source autodeploy 或 `Wait for CI`；Actions 必须先推送 GHCR image，再把每个 service 切到该 commit 的不可变 digest。Railway Deployments 页面应显示与 workflow summary 相同的 deployment ID。

## Lexicon 发布失败

不要绕过 artifact schema、双 hash、引用闭包或 release 校验。通过 Job progress 确认失败发生在 Builder 生成/校验还是 Publisher staging/commit，并检查对应 `/data/lexicon-builder`、`/data/lexicon-publisher` 路径及对象存储最小权限。失败详情记录在 `Job`、`JobAttempt`、checkpoint 与 release evidence 中；日志不得包含数据库、对象存储或 Provider 凭据。
