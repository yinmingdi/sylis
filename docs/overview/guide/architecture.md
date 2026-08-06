# 系统架构

Sylis 是 pnpm + Turbo monorepo。在线系统由 User Web、Admin Web、模块化 NestJS
API 和 Worker 组成；词典内容由独立 Compiler Runner 生成标准制品，再由 Importer
写入 PostgreSQL DRAFT release。

```text
Internet
   |
   +--> Railway web (Caddy + React) -----+
   +--> Railway admin (Caddy + React) ---+--> Railway api (NestJS)
                                                |--> PostgreSQL
                                                `--> Redis (wakeup only)

Railway worker -------------------------------> PostgreSQL / Redis / runtime AI
Railway compiler-runner --> source + compiler --> object storage JSON artifact
Railway importer <--------- JSON artifact -----> PostgreSQL DRAFT release
```

浏览器不接触 Railway 私网地址、数据库连接串或供应商密钥。API 负责同步请求、认证、
领域事务和 Job 创建；Worker 负责运行时 AI、导出、计划和来源同步。PostgreSQL 是 Job
状态真相，Redis 只用于唤醒。

应用发布与词典发布相互独立。GitHub Actions 从触发 workflow 的精确 commit 构建六个
Docker image，推送到 GHCR，并在 required CI 通过后让 Railway 按不可变 digest 部署。
`develop` 对应 staging，`main` 对应 production；两套环境分别拥有数据库、Redis、
Volume、对象存储凭据和密钥。

词典构建不会随应用部署自动启动。维护者显式发起 Compiler Job，并在制品验证后单独
执行 Importer dry-run、import、validate 和受保护 activation。完整边界见
[重构架构总览](../refactor/architecture/system.md) 与
[CI/CD、Railway 与密钥](../refactor/delivery/cicd-security.md)。
