# 配置与密钥

每个运行单元只读取自己拥有的变量。真实值放本地未跟踪 `.env`、GitHub environment secret 或 Railway sealed variable；仓库只提交 `.env.example`。相同用途在 staging 和 production 使用不同值。配置的完整、可执行清单以每个 app 的 `.env.example` 为准，本页只记录跨应用的所有权边界。

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

`SMTP_HOST/PORT/USER/PASSWORD/FROM` 可选。API 不接收 Provider API key、Railway token 或系统 artifact 写凭据。生产 `COOKIE_SECURE=true`，`PUBLIC_ORIGIN` 与 `ADMIN_ORIGIN` 必须是精确 HTTPS origin。

API 还是 Railway 私网 readiness gateway。以下九个值在 Railway 中必须使用目标
service 的 reference variables 组合，不能复制域名或在代码里猜端口：

```env
DEPLOYMENT_ADMIN_API_READINESS_URL=http://${{admin-api.RAILWAY_PRIVATE_DOMAIN}}:${{admin-api.PORT}}/health/ready
DEPLOYMENT_AGENT_API_READINESS_URL=http://${{agent-api.RAILWAY_PRIVATE_DOMAIN}}:${{agent-api.PORT}}/health/ready
DEPLOYMENT_MODEL_GATEWAY_READINESS_URL=http://${{model-gateway.RAILWAY_PRIVATE_DOMAIN}}:${{model-gateway.PORT}}/health/ready
DEPLOYMENT_AGENT_EXECUTOR_READINESS_URL=http://${{agent-executor.RAILWAY_PRIVATE_DOMAIN}}:${{agent-executor.PORT}}/ready
DEPLOYMENT_AGENT_EVALUATOR_READINESS_URL=http://${{agent-evaluator.RAILWAY_PRIVATE_DOMAIN}}:${{agent-evaluator.PORT}}/ready
DEPLOYMENT_ASSET_PROCESSOR_READINESS_URL=http://${{asset-processor.RAILWAY_PRIVATE_DOMAIN}}:${{asset-processor.PORT}}/ready
DEPLOYMENT_AUTOMATION_EXECUTOR_READINESS_URL=http://${{automation-executor.RAILWAY_PRIVATE_DOMAIN}}:${{automation-executor.PORT}}/ready
DEPLOYMENT_LEXICON_BUILDER_READINESS_URL=http://${{lexicon-builder.RAILWAY_PRIVATE_DOMAIN}}:${{lexicon-builder.PORT}}/ready
DEPLOYMENT_LEXICON_PUBLISHER_READINESS_URL=http://${{lexicon-publisher.RAILWAY_PRIVATE_DOMAIN}}:${{lexicon-publisher.PORT}}/ready
```

每个目标 service 都要显式设置其 `PORT`；Railway 不会让
<code v-pre>${{service.PORT}}</code>
自动指向运行时注入的随机端口。缺少任一 URL 时，对应
`/health/deployment/:service` 以 `503` fail closed。参见 Railway 官方
[Private Networking](https://docs.railway.com/private-networking) 和
[Reference Variables](https://docs.railway.com/variables/reference)。

## Model Gateway 与 Agent

```env
DATABASE_URL=<private-database-reference>
CREDENTIAL_KEK_KEYS_JSON={"v1":"<32-byte-base64-key>"}
CREDENTIAL_KEK_ACTIVE_VERSION=v1
MODEL_CONTENT_KEK_KEYS_JSON={"v1":"<32-byte-base64-key>"}
MODEL_CONTENT_KEK_ACTIVE_VERSION=v1
```

Provider key 以 envelope-encrypted Credential Profile 存入数据库，只允许 Model Gateway 解密；Agent Executor、Agent Evaluator、Lexicon Builder 和 API 通过短期 service grant 调用 Gateway。测试使用确定性 fake Provider，不需要真实 key，也不能 fallback 到公网 Provider。

## Job Executor

```env
ADMIN_API_URL=http://admin-api.railway.internal:3100
SERVICE_GRANT_TOKEN=<service-specific-bootstrap-secret>
JOB_POLL_INTERVAL_MS=5000
```

Agent Executor、Agent Evaluator、Asset Processor、Automation Executor、Lexicon Builder 与 Lexicon Publisher 使用独立 service identity、audience、scope 和对象存储权限。它们不共享一个万能 token；Provider API key 也不下发到这些应用。`JOB_CHECKPOINT_KEY_BASE64` 只由持有 Job store 的 Admin API 读取，executor 不持有 checkpoint encryption key。只有确实通过 Prisma 读取业务投影的 Automation Executor、Lexicon Builder 和 Lexicon Publisher 接收各自最小权限 `DATABASE_URL`；其余 executor 只通过 owner API 和 Model Gateway 工作。

Automation Executor 还必须显式配置它实际调用的 owner 和存储边界：

```env
API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}
AGENT_API_URL=http://${{agent-api.RAILWAY_PRIVATE_DOMAIN}}:${{agent-api.PORT}}
MODEL_GATEWAY_URL=http://${{model-gateway.RAILWAY_PRIVATE_DOMAIN}}:${{model-gateway.PORT}}
OBJECT_STORAGE_ENDPOINT=<private-s3-endpoint>
OBJECT_STORAGE_PUBLIC_ENDPOINT=<browser-reachable-signed-url-endpoint>
OBJECT_STORAGE_REGION=<region>
OBJECT_STORAGE_FORCE_PATH_STYLE=false
OBJECT_STORAGE_ACCESS_KEY_ID=<automation-writer-id>
OBJECT_STORAGE_SECRET_ACCESS_KEY=<sealed-automation-writer-secret>
QUARANTINE_BUCKET=<quarantine-bucket>
CLEAN_ASSET_BUCKET=<clean-assets-bucket>
EXPORT_BUCKET=<system-export-bucket>
AUDIT_ARCHIVE_BUCKET=<immutable-audit-archive-bucket>
AUDIT_ARCHIVE_ENCRYPTION_KEYS_JSON={"v1":"<32-byte-base64-key>"}
AUDIT_ARCHIVE_ENCRYPTION_ACTIVE_KEY_VERSION=v1
SOURCE_SYNC_ALLOWED_ORIGINS=https://trusted-source.example,https://mirror.example
```

`API_URL`、`AGENT_API_URL` 和 `MODEL_GATEWAY_URL` 使用 Railway service reference variables，不复制域名。`OBJECT_STORAGE_PUBLIC_ENDPOINT` 只用于生成浏览器可达的短期签名地址；credential 与 private endpoint 不返回浏览器。Audit archive 使用独立 Bucket 和 versioned sealed key ring；active version 只决定新归档加密，历史 key 在对应 archive 到期并清理前不得移除。

`SOURCE_SYNC_ALLOWED_ORIGINS` 是 Automation Executor 唯一允许下载注册数据源的 HTTPS origin 清单，使用逗号分隔并精确匹配协议、主机和端口，不支持通配符。测试环境的内部 CA 数据源也必须显式列入该清单。

## Admin API 与应用发布证据

Admin API 同时持有两个相互隔离的数据库连接，但只有 deployment module 能注入第二个连接：

```env
DATABASE_URL=<runtime-url-with-sylis_admin_api-role>
DEPLOYMENT_INGEST_DATABASE_URL=<runtime-url-with-sylis_ci_ingestor-role>
DEPLOYMENT_INGEST_TOKEN=<independent-32-byte-github-actions-secret>
```

`sylis_admin_api` 对 `DeploymentRelease` 只有 `SELECT`；`sylis_ci_ingestor` 只有 `SELECT/INSERT`，并只能追加一条与同事务 SecurityAuditEvent 闭合的 release。两者都不能 UPDATE/DELETE。`DEPLOYMENT_INGEST_TOKEN` 在 Railway Admin API sealed variable 与 GitHub protected production environment 中保存同一值，不进入通用 `SERVICE_GRANT_TOKENS_JSON`、Admin browser、artifact 或日志。Admin Caddy 只代理精确 `/internal/v1/deployment-releases` 路径，公开 Admin OpenAPI 仍只有 `/api/admin/v1/deployment-releases` GET projection。

## Lexicon Builder 与 Publisher

```env
LEXICON_BUILDER_WORK_ROOT=/data/lexicon-builder/work
LEXICON_ARTIFACT_ROOT=/data/lexicon-builder/artifacts
LEXICON_ARTIFACT_ALLOW_FILE=false
LEXICON_AI_ENABLED=false
LEXICON_PUBLISHER_WORK_ROOT=/data/lexicon-publisher/work
AWS_ENDPOINT_URL=https://<private-s3-endpoint>
AWS_DEFAULT_REGION=<region>
AWS_S3_BUCKET_NAME=<lexicon-artifact-bucket>
AWS_S3_URL_STYLE=virtual
AWS_ACCESS_KEY_ID=<service-specific-access-key>
AWS_SECRET_ACCESS_KEY=<sealed-service-specific-secret>
```

Builder 可通过 Model Gateway 使用独立的 compiler Credential Profile 生成候选 artifact。Publisher 不持有 AI 凭据，只读取固定 hash 的 artifact、校验并写入未激活 release。Builder 的 Bucket credential 只能写 content-addressed lexicon artifact；Publisher 使用独立只读 credential，并从 Job 固定的 `s3://bucket/key` 取得 bucket，因此不读取 `AWS_S3_BUCKET_NAME`。`LEXICON_ARTIFACT_ALLOW_FILE` 只允许本地 fixture；staging/production 必须为 `false`，`AWS_ENDPOINT_URL` 必须为 HTTPS。

Lexicon artifact 与 User/Agent asset 使用两个显式配置面：Compiler/Builder/Publisher 复用 compiler CLI 的 `AWS_*` 契约；Agent API 和 Automation Executor 使用 `OBJECT_STORAGE_*` 及 `QUARANTINE_BUCKET`、`CLEAN_ASSET_BUCKET`、`EXPORT_BUCKET`。Railway 中必须使用不同 access key 和 Bucket policy，变量名相似不代表权限可共享。

## Web 与 Admin

Web 和 Admin 使用同源 `/api`，Caddy 通过 Railway private network 连接 API。任何 `VITE_*` 都会进入浏览器 bundle，因此禁止放 AI key、数据库 URL、对象存储凭据、cookie signing key 或 Railway token。两个应用有独立域名和 session audience。

## Railway 与 GitHub

`sylis / staging` 和 `sylis / production` GitHub environments 分别定义：

- secret `RAILWAY_TOKEN`：environment-scoped project token；
- variables `RAILWAY_PROJECT_ID`、`RAILWAY_ENVIRONMENT_ID`；
- 十二个 `RAILWAY_<SERVICE>_SERVICE_ID`，与十二个 app 一一对应；
- `SYLIS_HEALTH_URLS`：逗号分隔的公开 API/Web/Admin health URL。

受保护的 production environment 另外保存 `DEPLOYMENT_INGEST_TOKEN`；production smoke 成功后，`release.yml` 才通过 `SYLIS_ADMIN_URL` 提交固定 manifest hash、十二个 image digest、CI/workflow run identity 和链接。相同 payload 可幂等重放，任一字段漂移都冲突。

Railway service 自己保存 DATABASE/Redis reference variables、运行密钥和 GHCR `read:packages` registry credential。需要本地工作目录的 Builder 与 Publisher 分别挂载最小化 `/data` Volume，并令 `RAILWAY_VOLUME_MOUNT_PATH`、work root 与 artifact root 保持同一挂载边界；可水平扩展性由 Job lease/fencing 保证。完整设置和验证步骤见 [CI/CD、Railway 与密钥](../refactor/delivery/cicd-security.md)。

API service 另外保存 sealed `DATABASE_OWNER_URL`。它只供 API image 的 pre-deploy command 使用，连接 schema owner；运行进程继续使用权限更窄的 `DATABASE_URL`。Railway 中为每个 image service 保留对应 `railway.<app>.json` 的 health/restart 设置，并把 API pre-deploy 固定为：

```sh
DATABASE_URL="$DATABASE_OWNER_URL" sh -c 'cd node_modules/@sylis/database && node dist/operations/install-database.js'
```

`0.0.1` 尚无生产 User，因此 pre-deploy 明确执行 destructive greenfield install：
Prisma `db push --force-reset` 从 `schema.prisma` 建立全部表、enum、关系和普通索引，
随后执行 `prisma/invariants.sql` 建立 Prisma 无法表达的 PostgreSQL 约束、trigger、
function、role 与 grant。仓库不包含 migration 目录，也不创建
`_prisma_migrations`。重复部署会再次清库；开始保留生产数据前必须先修改这项发布
策略。

发布流水线必须先等待 API pre-deploy 与 API readiness 成功，再并行提升其余十一个 digest。pre-deploy 不写 Volume，也不执行词典 build 或付费模型调用；它会写 reference data，并在五个 `SYLIS_SYNTHETIC_*` 全部配置时创建专用账号和单词 `bank` 的静态 deployment canary release。canary 不替代正式 JSON artifact；每次 destructive reset 后，正式词典都必须重新走 Builder -> Publisher -> activation，直到该阶段的重建策略被替换。
