# 配置与密钥

每个运行单元只读取自己拥有的变量。真实值放本地未跟踪 `.env`、GitHub environment secret 或 Railway sealed variable；仓库只提交 `.env.example`。相同用途在 staging 和 production 使用不同值，Compiler AI 与 Runtime AI 使用不同 key。

## API

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sylis
REDIS_URL=redis://localhost:6379
PUBLIC_ORIGIN=http://localhost:5173
ADMIN_ORIGIN=http://localhost:5180
WEBAUTHN_RP_ID=localhost
WEBAUTHN_RP_NAME=Sylis
COOKIE_SECURE=false
SESSION_TTL_SECONDS=2592000
SESSION_HASH_KEY=<independent-random-value-at-least-32-characters>
CSRF_SIGNING_KEY=<independent-random-value-at-least-32-characters>
REGISTRATION_SIGNING_KEY=<independent-random-value-at-least-32-characters>
CONTENT_ENCRYPTION_KEYS_JSON={"v1":"<32-byte-base64-key>"}
CONTENT_ENCRYPTION_ACTIVE_KEY_VERSION=v1
```

`SMTP_HOST/PORT/USER/PASSWORD/FROM` 可选。API 不接收 `RUNTIME_AI_*`、`LEXICON_AI_*`、Railway token 或对象存储写凭据。生产 `COOKIE_SECURE=true`，`PUBLIC_ORIGIN` 与 `ADMIN_ORIGIN` 必须是精确 HTTPS origin。

## Worker

Worker 读取 `DATABASE_URL`、可选 `REDIS_URL`、`JOB_*`、`CONTENT_ENCRYPTION_*`、`RUNTIME_AI_*`、结果对象存储和可选 Reddit 凭据。关键边界：

```env
JOB_CHECKPOINT_KEY_BASE64=<32-byte-base64-key>
RUNTIME_AI_ENABLED=false
RUNTIME_AI_PROVIDER=deepseek
RUNTIME_AI_BASE_URL=https://api.deepseek.com
RUNTIME_AI_STRICT_BASE_URL=https://api.deepseek.com/beta
RUNTIME_AI_MODEL=<validated-runtime-model>
RUNTIME_AI_API_KEY=<runtime-only-secret>
```

启用 runtime AI 时同时配置明确的输入、输出和 cache-hit 单价；Worker 启动时校验预算/价格。`RUNTIME_AI_API_KEY` 不提供给 API、Compiler Runner 或浏览器。

## Compiler Runner

```env
DATABASE_URL=<railway-private-reference>
JOB_CHECKPOINT_KEY_BASE64=<32-byte-base64-key>
LEXICON_RUNNER_WORK_ROOT=/data/lexicon-compiler/work
LEXICON_ARTIFACT_ROOT=/data/lexicon-compiler/artifacts
LEXICON_ARTIFACT_ALLOW_FILE=false
LEXICON_AI_BASE_URL=https://api.deepseek.com
LEXICON_AI_STRICT_BASE_URL=https://api.deepseek.com/beta
LEXICON_AI_MODEL=<validated-compiler-model>
LEXICON_AI_API_KEY=<compiler-only-secret>
LEXICON_AI_CACHE_KEY=<independent-32-byte-key>
```

生产 artifact 发布还需最小权限的 S3-compatible `AWS_*` 变量。`LEXICON_ARTIFACT_ALLOW_FILE` 只允许本地 fixture；staging/production 必须为 `false` 并发布到不可变对象存储。

## Importer

```env
DATABASE_URL=<railway-private-reference>
JOB_CHECKPOINT_KEY_BASE64=<32-byte-base64-key>
LEXICON_IMPORTER_WORK_ROOT=/data/lexicon-importer/work
```

当 Job 使用 `s3://` URI 时添加只读 `AWS_*` 凭据。Importer 不配置任何 AI key，也没有激活以外的运行时应用密钥。

## Web 与 Admin

Web 和 Admin 使用同源 `/api`，Caddy 通过 Railway private network 连接 API。任何 `VITE_*` 都会进入浏览器 bundle，因此禁止放 AI key、数据库 URL、对象存储凭据、cookie signing key 或 Railway token。两个应用有独立域名和 session audience。

## Railway 与 GitHub

`sylis / staging` 和 `sylis / production` GitHub environments 分别定义：

- secret `RAILWAY_TOKEN`：environment-scoped project token；
- variables `RAILWAY_PROJECT_ID`、`RAILWAY_ENVIRONMENT_ID`；
- 六个 `RAILWAY_<SERVICE>_SERVICE_ID`；
- `SYLIS_HEALTH_URLS`：逗号分隔的公开 API/Web/Admin health URL。

Railway service 自己保存 DATABASE/Redis reference variables、运行密钥和 GHCR `read:packages` registry credential。Compiler Runner 与 Importer 分别挂载 `/data` Volume，固定单副本。完整设置和验证步骤见 [CI/CD、Railway 与密钥](../refactor/delivery/cicd-security.md)。
