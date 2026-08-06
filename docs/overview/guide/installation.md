# 安装指南

## 工具链

项目固定使用 Node.js 24 和 pnpm 10.23.0：

```bash
corepack enable
corepack prepare pnpm@10.23.0 --activate
pnpm install --frozen-lockfile
```

## 本地配置

从各运行时的 `.env.example` 创建 ignored 本地环境文件。API、Worker、Compiler Runner 和 Importer 具有不同变量边界，完整清单见 [运行配置](./configuration.md)。本地不测试 AI 时保持：

```text
RUNTIME_AI_ENABLED=false
LEXICON_AI_ENABLED=false
```

不要向 `VITE_*`、文档、命令参数或仓库文件写入任何密钥。Compiler AI 和 Runtime AI 使用不同的 key；API 与浏览器不接收二者。

准备本地 PostgreSQL 和 Redis 后生成 client 并应用 fresh migration：

```bash
pnpm --filter @sylis/database prisma:generate
pnpm --filter @sylis/database prisma:migrate
pnpm dev
```

Web 默认运行在 `http://localhost:5178` 并将 `/api` 代理到本地 API。Admin、Worker、Runner 和 Importer 可通过各 package 的 `dev` 或 `start` script 单独启动。

## 构建与数据

```bash
pnpm build
pnpm test
```

生产环境不运行 seed。词典内容由维护者显式执行 Compiler build，再使用 `@sylis/lexicon-importer` 完成 dry-run、import、validate 和受保护 activation；安装或部署应用不会调用 DeepSeek，也不会自动生成 JSON。
