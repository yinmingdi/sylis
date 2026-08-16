# 系统架构

Sylis 是 pnpm + Turborepo monorepo。十二个 `apps/**` 都是可独立部署产物：两个前端、
四个同步后端、四个专职执行器和两个词典数据面应用。十一项可复用能力位于
`packages/**`，工程 Harness 位于 `tools/engineering-harness`。

```text
Browser --> web -----------> api -----------+
        `-> admin ---------> admin-api -----+--> PostgreSQL / Redis / object storage
                             |              |
                             +-> agent-api -+-> model-gateway -> provider adapters
                                      ^
                                      +-- agent-executor / agent-evaluator
                                      +-- asset-processor / automation-executor

sources -> lexicon-builder -> immutable JSON artifact -> lexicon-publisher
                                                       -> DRAFT LexiconRelease
```

浏览器不接触 Railway 私网地址、数据库连接串或供应商密钥。同步 API 拥有领域事务，
专职 executor 通过 typed command 调用 owner API，不能直接改写不归它所有的领域表。
Model Gateway 独占 Provider credential、permit、调用交换和 usage。PostgreSQL 是 Job
和领域状态真相，Redis 只用于唤醒与短暂增量。

应用发布与词典发布相互独立。GitHub Actions 从 protected `main` 的精确 commit 构建
十二个 Docker image，用同一批 image 完成 E2E，再推送不可变 GHCR digest 并自动部署
staging。维护者审核 staging evidence 后手工创建 `v0.0.1` release，把同一组 digest
提升到 production；两套环境分别拥有数据库、Redis、Volume、对象存储凭据和密钥。

词典构建不会随应用部署自动启动。维护者显式发起 BuildRun；Builder 输出标准制品，
Publisher 校验并导入 DRAFT release，Admin 再执行受保护 activation。完整边界见
[重构架构总览](../refactor/architecture/system.md) 与
[CI/CD、Railway 与密钥](../refactor/delivery/cicd-security.md)。
