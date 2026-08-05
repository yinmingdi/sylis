# 后端目录与 NestJS 模块边界

## 1. 目的与原则

本文定义 `apps/api`、`apps/worker`、`services/lexicon-compiler-runner` 与 `services/lexicon-importer` 的目标结构。API 和 Worker 采用 NestJS module-first 组织；Compiler 是纯 library/CLI；Compiler Runner 与 Importer 是长任务 executor，不进入用户请求路径。

目标遵循 NestJS 的 module/provider 组合方式，而不是把每个业务模块强制拆成 `transport/application/domain/infrastructure` 四层。目录只在有实现时创建，复杂度通过清晰 provider 和用例服务拆分，不能通过空目录或一文件一层伪装边界。

## 2. API 完整目标树

```text
apps/api/
  package.json
  nest-cli.json
  tsconfig.json
  src/
    app.module.ts
    main.ts
    config/
      env.schema.ts
      api.config.ts
    platform/
      auth/
      http/
      logging/
      database/
      cache/
      outbox/
      observability/
    modules/
      identity/
      health/
      lexicon/
      books/
      study/
      exercises/
      assessments/
      notebooks/
      reading/
      reddit/
      ai-tutor/
      jobs/
      operations/
  test/
    architecture/
    contracts/
    integration/
    e2e/
```

业务 module 的标准形状：

```text
modules/<name>/
  <name>.module.ts
  controllers/       HTTP controller；User/Admin controller 可分文件
  dto/               transport input/output 与 OpenAPI metadata
  services/          command/query/use-case provider
  repositories/      repository interface/token 与 Prisma implementation
  entities/          module-owned entity/value object；需要时才创建
  policies/          纯授权/业务 policy；需要时才创建
  events/            domain/outbox event contract；需要时才创建
  index.ts            跨 module 唯一 public surface
```

简单模块可以只有 module、controller 和 service，例如：

```text
modules/health/
  health.module.ts
  controllers/health.controller.ts
  services/health.service.ts
  index.ts
```

复杂 service 按用例拆分，例如 `create-assessment-session.service.ts`、`submit-exercise-response.service.ts`，不建立一个不断增长的 `AssessmentService`。Repository 属于业务 module，`@sylis/database` 只提供持久化基础设施，不拥有业务 repository。

## 3. API module 所有权与公开接口

| Module        | 所有权                                                      | 可跨 module 导出                                     |
| ------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| `identity`    | User、credential、session、consent、ADMIN actor/RBAC        | actor/session guard token、只读 user capability port |
| `health`      | API liveness/readiness projection                           | 通常不导出 provider                                  |
| `lexicon`     | release-pinned search 与 lexical entity/material 查询       | `LexiconQueryPort`、typed target resolver token      |
| `books`       | stable book、edition、membership/enrollment command         | edition query port                                   |
| `study`       | plan、Objective memory、ReviewEvent、FSRS                   | objective/memory query port、review command          |
| `exercises`   | revision delivery、response validation、确定性评分          | exercise delivery/scoring port                       |
| `assessments` | blueprint、session、response、result                        | assessment application service；不导出 repository    |
| `notebooks`   | user-owned notebook 与 typed lexical target                 | notebook application API                             |
| `reading`     | document/revision、annotation、activity、saved              | reading query/command ports                          |
| `reddit`      | Reddit source adapter 与 experience projection              | Reddit application service；正文事实交给 reading     |
| `ai-tutor`    | tutor、grammar、generation request 与安全 runtime contract  | 创建 AI Job 的 application service                   |
| `jobs`        | enqueue/query/cancel、SSE projection、outbox wake           | `BackgroundJobClient`/token；不导出 executor 实现    |
| `operations`  | Admin build/review/import/release/deployment/audit commands | 受权限保护的 application services                    |

Nest provider 默认为 module-private。跨 module 使用必须同时满足：提供方在 `<name>.module.ts` 的 `exports` 明确导出 token，消费方 `imports` 对应 module，并从 `index.ts` 引入 token/interface。禁止从其他 module deep import service/repository/entity 实现。

`AppModule` 只做 composition：注册配置、平台 module 和业务 module。它不放业务 provider、数据库查询、定时任务或 route 逻辑。

## 4. 数据库 package

```text
packages/database/
  package.json
  prisma.config.ts
  src/
    client/
      prisma-client.ts
      prisma-lifecycle.ts
    config/
      database-config.ts
    testing/
      test-database.ts
    index.ts
  prisma/
    schema/
      platform.prisma
      lexicon-core.prisma
      lexicon-content.prisma
      lexicon-synsem.prisma
      lexicon-morphology.prisma
      provenance.prisma
      corpus.prisma
      books.prisma
      study.prisma
      exercises.prisma
      assessments.prisma
      identity.prisma
      notebooks.prisma
      reading-core.prisma
      reddit.prisma
      ai-tutor.prisma
      ai-operations.prisma
      jobs.prisma
      outbox.prisma
      audit.prisma
      operations.prisma
    migrations/
    seed/
```

`@sylis/database` 独占 Prisma schema、migration、generated client、连接配置与框架无关的 client lifecycle factory。它是 server-only package，不发布到浏览器，不导出带业务语义的 repository，也不隐藏 transaction boundary。API 在 `src/platform/database` 用一个 Nest module 包装该 factory；这个 wrapper 只负责 DI/lifecycle，不重新拥有 schema 或 repository。

API/Worker/Runner/Importer 可以依赖数据库 package 的 client 和 generated types；业务查询仍由各自 module/adapter 实现。Migration 只有一个 owner，禁止在 app/service 下再放第二套 `prisma/**`。

## 5. Background Jobs contract package

```text
packages/background-jobs/
  package.json
  src/
    kinds/
      job-kind.ts
      executor-kind.ts
    state/
      job-state.ts
      transitions.ts
    contracts/
      payloads.ts
      progress.ts
      checkpoint.ts
      results.ts
      events.ts
    ports/
      client.ts
      handler.ts
      control.ts
    validation/
      schemas.ts
      validators.ts
    testing/
      contract-fixtures.ts
    index.ts
```

`@sylis/background-jobs` 只定义 `JobKind`、状态机、payload/progress/checkpoint/result schema、handler/control interface 和纯验证器。它不得依赖 NestJS、Prisma、Redis、Railway、AI provider 或任何 app 源码。

API `jobs` module 实现 enqueue/query/cancel/SSE adapter；Worker、Compiler Runner 和 Importer 实现 executor adapter。所有实现消费同一纯 contract，不复制状态枚举。

## 6. Worker 完整目标树

```text
apps/worker/
  package.json
  nest-cli.json
  tsconfig.json
  src/
    main.ts
    worker.module.ts
    config/
    health/
      health.module.ts
      live.controller.ts
      ready.controller.ts
    runtime/
      runtime.module.ts
      claim.service.ts
      lease.service.ts
      heartbeat.service.ts
      checkpoint.service.ts
      shutdown.service.ts
      handler-registry.ts
    handlers/
      tutor-message/
      grammar-diagnosis/
      reading-generation/
      user-export/
      source-sync/
    adapters/
      database/
      redis-wakeup/
      object-storage/
      ai-provider/
  test/
    architecture/
    contracts/
    integration/
```

Worker 是独立 Nest application。它只暴露 Railway 私网 `/live` 与 `/ready`，不暴露业务 HTTP API。它拥有 runtime AI、导出和同步 handler，不执行 `LEXICON_BUILD` 或 `LEXICON_IMPORT`。

Worker 绝不能导入 `apps/api/src/**`。共享契约来自 packages；数据库表访问通过 `@sylis/database`；AI 通过 `@sylis/ai-provider`。Worker 自己组合 claim/lease/handler lifecycle，API 不充当 worker library。

## 7. Compiler 与 Compiler Runner

纯 compiler：

```text
packages/lexicon-compiler/
  src/
    cli/
    candidates/
    manifest/
    sources/
    normalize/
    resolve/
    enrich/
    pedagogy/
    learning/
    validate/
    export/
    progress/
  test/
    fixtures/
    golden/
```

Railway runner：

```text
services/lexicon-compiler-runner/
  package.json
  Dockerfile
  tsconfig.json
  src/
    main.ts
    runner.module.ts
    config/
    runtime/
      claim.service.ts
      lease.service.ts
      checkpoint-store.ts
      progress-reporter.ts
      shutdown.service.ts
    handlers/
      lexicon-build.handler.ts
    adapters/
      database/
      object-storage/
      ai-provider/
      source-fetch/
  test/
    contracts/
    integration/
```

`@sylis/lexicon-compiler` 保持无 NestJS、Prisma、生产数据库和 Railway 依赖的纯 library/CLI。它通过注入的 progress/AI/clock port 工作，并只读取 manifest 指向的固定本地输入；Runner 负责把 source/cache/object-storage materialize 到工作目录。Compiler 可在本地 fixture/pilot 和 CI 中确定性验证。

Compiler Runner 是独立 Railway background service，只 claim `LEXICON_BUILD`，装配 DeepSeek/source/object storage/database adapter，调用 compiler public API，持久化 checkpoint/progress，并上传最终 `sylis-lexicon-v1.json.zst`。它不拥有词典解析/合并规则，也不激活 release。

GitHub protected workflow 负责审核 manifest、预算与已验证 artifact 后发起/批准 publish；长时间计算运行在 Railway runner，避免把 GitHub Actions 当长期 batch host。

## 8. Importer 完整目标树

```text
services/lexicon-importer/
  package.json
  Dockerfile
  tsconfig.json
  src/
    main.ts
    cli/
    config/
    artifact/
      reader.ts
      preflight.ts
      mapping-registry.ts
    runtime/
      claim.ts
      lease.ts
      checkpoint.ts
      progress.ts
    staging/
      copy-stream.ts
      staging-schema.ts
      validators.ts
    build/
      identities.ts
      release-facts.ts
      provenance.ts
      summaries.ts
    validate/
      release-validator.ts
    activate/
      activate-release.ts
    adapters/
      database/
      object-storage/
  test/
    fixtures/
    contracts/
    integration/
```

Importer 是专门的 TypeScript batch service，不需要为贴合 API 而套 NestJS。它只消费已验证 artifact，使用 streaming parser、COPY 和 set-based SQL 构建 DRAFT/VALIDATED release。它不能解析 ECDICT/Kaikki/有道，不能调用 AI，不能依赖 compiler，也不能在导入完成时隐式激活。

Importer 可以依赖 `@sylis/lexicon-contracts`、`@sylis/background-jobs`、`@sylis/database` 与必要的流式/数据库库。CLI 的纯离线 `validate-artifact` 路径不得读取 `DATABASE_URL`。

## 9. 允许与禁止依赖

允许的核心方向：

```text
api -----------------------> database/background-jobs/utils
worker --------------------> database/background-jobs/ai-provider/utils
compiler-runner -----------> lexicon-compiler/background-jobs/database/ai-provider
lexicon-compiler ----------> lexicon-contracts/ai-provider ports/utils
lexicon-importer ----------> lexicon-contracts/background-jobs/database/utils
```

额外规则：

- API module 之间只通过 exported Nest module/token/interface 协作。
- `platform` 只提供横切基础设施；它不得成为业务 service 的堆放区。
- `@sylis/ai-provider` 的 public contract 与 adapter 分开；compiler library 只见结构化生成 port，API 不依赖 provider package，只有 Worker/Runner composition 读取各自 sealed secret。
- 只有 server project 可以依赖 `@sylis/database` 和 executor contract。

禁止：

- 任意 project 导入另一个 app/service 的 `src/**`。
- Worker、Runner、Importer 从 API module 复用 repository/service。
- API 或 Worker 依赖 compiler/importer。
- Compiler 依赖 NestJS、Prisma、生产数据库、Railway 或 importer。
- Importer 依赖 compiler、source adapter 或 AI provider。
- Database package 拥有业务 repository 或重新导出全部 server package。
- Background Jobs package 依赖某个 queue/ORM/framework implementation。
- `AppModule` 注册 batch compiler/importer handler 或执行长任务。
- `@sylis/shared` 作为 DTO/Prisma/provider 聚合层；目标 workspace 删除它。

集中 package allowlist、exports 和 import architecture tests 执行跨 package 限制；API/Worker 内部的 module public surface 由 ESLint restricted imports 和 architecture tests 执行。

## 10. 当前路径迁移映射

### 10.1 API 平台

| 当前路径                                         | 目标                                                      |
| ------------------------------------------------ | --------------------------------------------------------- |
| `apps/api/src/main.ts`, `app.module.ts`          | bootstrap + composition-only `AppModule`                  |
| `src/filter`, `interceptor`, `decorators`        | `src/platform/http`                                       |
| `src/modules/logger`                             | `src/platform/logging`                                    |
| `src/modules/prisma`                             | `src/platform/database` Nest wrapper + `@sylis/database`  |
| `src/modules/redis`                              | `src/platform/cache`/outbox wake adapter；示例不进产物    |
| `src/config`, `constants`, `third-party-modules` | typed config + composition；删除通用注册杂物层            |
| `src/jobs/**`                                    | 离线 enrichment 删除；runtime handler 迁 Worker           |
| `src/templates/**`                               | identity/mail adapter 私有 template 或专门通知 owner      |
| `src/types/**`                                   | 对应 module/package owner；删除全 API 类型 barrel         |
| `src/utils/proficiency-calculator.ts`            | 删除旧星级/词汇量估算                                     |
| `src/utils/**` 其余纯函数                        | module-local 或 `@sylis/utils`，按 owner/跨 runtime 判定  |
| `apps/api/scripts/**`                            | `tools/scripts`、database seed 或删除旧词典脚本           |
| `apps/api/src/__test__`, `apps/api/test`         | 新 `test/{contracts,integration,e2e}` 或 module unit test |
| `apps/api/prisma/**`                             | `packages/database/prisma/**`                             |

### 10.2 API 业务模块

| 当前 module           | 目标                                  |
| --------------------- | ------------------------------------- |
| `auth` + `user`       | `identity`                            |
| `health`              | `health`                              |
| `words`               | `lexicon`                             |
| `books`               | `books`                               |
| `learning`            | `study` + `books`                     |
| `quiz`                | `exercises`                           |
| `vocabulary-test`     | `assessments`                         |
| `vocabulary-notebook` | `notebooks`                           |
| `articles`            | `reading` + Worker generation handler |
| `reddit`              | `reddit` + `reading`                  |
| `ai` + `chat`         | `ai-tutor` + Worker runtime handlers  |
| 新增                  | `jobs` + `operations`                 |

每个当前 `*.controller.ts` 迁 `controllers/`，DTO 迁 `dto/`，用例逻辑拆入 `services/`，数据访问迁 `repositories/`。旧巨型 service/repository 不原样换目录；先按目标用例和 owner 拆分，再删除旧 module export。

### 10.3 共享包与 importer

| 当前路径                                     | 目标                                                         |
| -------------------------------------------- | ------------------------------------------------------------ |
| `packages/shared/dto/**`                     | 两套 OpenAPI generated client；领域 artifact 进 contracts    |
| `packages/shared/configs/**`                 | root tooling config 或专门 config package（确有复用时）      |
| `packages/shared` 根配置/README              | 删除；必要规范迁 root config/对应 package README             |
| `packages/shared`                            | 删除                                                         |
| `packages/utils/src/reg-exp.ts`              | 保留前先证明通用且 API 明确；否则迁使用方                    |
| `packages/utils/src/validate.ts`             | 保留纯 validation primitive；业务 schema 迁 contracts/module |
| `packages/utils` 根配置/README               | 保留并重写纯函数边界；不重新导出其他 package                 |
| `services/vocabulary-importer/src/ecdict.ts` | compiler `sources/ecdict`                                    |
| `src/youdao.ts`, `src/youdao-import.ts`      | compiler `sources/youdao`                                    |
| `src/books.ts`                               | compiler source/content binding                              |
| `src/bulk-import.ts`                         | importer streaming/COPY/set-based 实现的参考，不保留旧 SQL   |
| `src/index.ts`                               | 新 importer CLI/runtime                                      |

## 11. 测试与门禁

- 每个业务 service 用 unit test 覆盖 policy、状态转换、事务前置条件和错误 mapping。
- Repository 对真实 PostgreSQL 跑 integration test；不以 mock Prisma 代替 SQL/FK/transaction 验证。
- User/Admin OpenAPI snapshot、generated client 与 RFC 9457 error 分别做 contract test。
- API e2e 覆盖 session、CSRF、idempotency、RBAC、release pinning、并发与 SSE cursor。
- BackgroundJob 状态机使用 property test；每个 JobKind 运行 shared contract suite。
- Worker/Runner/Importer 对 claim 竞争、lease expiry、checkpoint resume、drain、重复投递和 terminal immutability 做 integration test。
- Compiler 使用 fixture、golden、200 词 pilot 与 determinism test；Importer 从 artifact 在 fresh DB 做重建与 count/hash 验证。
- Architecture test 禁止 app-to-app source import、module deep import、browser-to-server package import、compiler/importer 反向依赖。
- Migration 在临时数据库执行 deploy + rollback rehearsal（数据 release 用 pointer rollback，不回滚已执行 schema migration）。

## 12. 完成条件

1. API 所有业务代码位于明确 Nest module，`AppModule` 仅 composition。
2. Prisma 唯一 owner 是 `@sylis/database`；repository 仍由业务 module/executor owner 持有。
3. `BackgroundJob` contract 只有 `@sylis/background-jobs` 一份实现无关定义。
4. Worker、Compiler Runner 与 Importer 是独立可部署 executor，且都不导入 API 源码。
5. Compiler 仍能作为纯 library/CLI 在无 NestJS、Prisma、Railway 环境运行。
6. pnpm/Turbo package graph、ESLint 与 architecture tests 自动拒绝全部禁止依赖。
