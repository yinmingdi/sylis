# 安装指南

## 工具链

项目固定使用 Node.js 24 和 pnpm 10.23.0：

```bash
corepack enable
corepack prepare pnpm@10.23.0 --activate
pnpm install --frozen-lockfile
```

## 本地配置

从各运行时的 `.env.example` 创建 ignored 本地环境文件。十个后端应用各自拥有独立变量边界，完整清单见 [运行配置](./configuration.md)。本地不测试 AI 时保持：

```text
LEXICON_AI_ENABLED=false
```

Model Gateway 本地开发默认使用显式 fake Provider route；没有 fake route 或有效 Credential Profile 时必须 fail closed，不能自动回退到公网 Provider。

不要向 `VITE_*`、文档、命令参数或仓库文件写入任何密钥。词典生成、Agent 执行与评估使用不同 Credential Profile；API、Executor 与浏览器不直接接收 Provider key，只有 Model Gateway 可以解密并消费凭据。

准备本地 PostgreSQL 和 Redis 后，从 Prisma Schema 安装完整的 `0.0.1` 数据库：

```bash
pnpm db:install
pnpm dev
```

`db:install` 会执行 `prisma db push --force-reset`，然后加载 Prisma 无法表达的
`packages/database/prisma/invariants.sql`。该命令会清空现有数据，不创建 migration
文件或 `_prisma_migrations` 表。

Web 默认运行在 `http://localhost:5178` 并将 `/api` 代理到本地 API。Admin 与各后端应用可通过对应 workspace 的 `dev` 或 `start` script 单独启动。

## 构建与数据

```bash
pnpm build
pnpm test
```

生产环境不运行 seed。词典内容由维护者显式创建 Lexicon Builder Job；Builder 生成并校验候选 artifact，Lexicon Publisher 将其提交成未激活的 `VALIDATED` release，Admin 再独立批准 activation。安装或部署应用不会调用 DeepSeek，也不会自动生成 JSON。
