# Workspace 项目图与 Nx 治理

## 1. 工具职责

Sylis 保留 pnpm workspace，并在其上增加 Nx：

- pnpm 负责 package 安装、lockfile、workspace protocol 与脚本执行。
- Nx 负责项目图、任务依赖、远程/本地 cache、`affected`、生成器和跨项目依赖约束。
- Vite/Nest/tsc/Prisma/Vitest/Playwright 仍负责各自 build/test/codegen；Nx 只编排，不替换这些工具。

Nx 与 Turborepo 是同类 monorepo task orchestration 工具，不属于同一产品生态。本项目选择 Nx 是因为除 task cache 外，还需要 project graph、tag 约束、`affected` 和生成器统一执行目标架构。不能同时引入 Turbo 形成两套 task graph。

Nx project 的粒度是可独立构建、发布、测试或具有明确边界的 app/service/package。`apps/web/src/modules/lexicon` 之类的应用内部 module 不是 Nx project；其边界由 ESLint 和 architecture tests 管理。

## 2. 完整目标 workspace

```text
.
├── apps/
│   ├── api/                         @sylis/api
│   ├── web/                         @sylis/web
│   ├── admin/                       @sylis/admin
│   └── worker/                      @sylis/worker
├── services/
│   ├── lexicon-compiler-runner/     @sylis/lexicon-compiler-runner
│   └── lexicon-importer/            @sylis/lexicon-importer
├── packages/
│   ├── lexicon-contracts/           @sylis/lexicon-contracts
│   ├── lexicon-compiler/            @sylis/lexicon-compiler
│   ├── api-client/                  @sylis/api-client
│   ├── admin-api-client/            @sylis/admin-api-client
│   ├── ai-provider/                 @sylis/ai-provider
│   ├── components/                  @sylis/components
│   ├── utils/                       @sylis/utils
│   ├── database/                    @sylis/database
│   ├── background-jobs/             @sylis/background-jobs
│   └── harness/                     @sylis/harness
├── docs/
│   ├── overview/                    @sylis/docs
│   └── components/                  @sylis/components-docs
├── tools/
│   ├── generators/
│   ├── architecture/
│   └── scripts/
├── nx.json
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── eslint.config.js
```

`packages/shared` 不在目标 workspace。Transport type 由两套 OpenAPI client 生成；artifact contract 归 `lexicon-contracts`；Job contract 归 `background-jobs`；数据库类型归 server-only `database`；UI 归 `components`；真正通用纯函数归 `utils`。保留一个 `shared` 聚合包只会重新混合这些边界。

## 3. 项目目录合同

所有 Nx project 至少包含：

```text
<project>/
  project.json
  package.json
  tsconfig.json
  src/                # 文档/纯 schema project 可按自身结构调整
  test/               # 或与源码共置的 *.spec.ts
```

`project.json` 只声明该 project 的 targets、inputs/outputs、tags 和少量 project-specific 配置。可复用 target defaults 放 `nx.json`；脚本实现留原工具配置或 `tools/scripts`，不把大段 shell 复制到每个 project。

所有可消费 package 必须在 `package.json.exports` 声明 public entry point。禁止使用 TypeScript path alias 绕过 package exports 或直接 import `src/**`。

## 4. 项目所有权与公开表面

| Project                   | Owner/职责                                              | Public surface / 输出                             |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| `api`                     | User/Admin HTTP、同步 command/query、Job client         | User/Admin OpenAPI 3.1 snapshots、container image |
| `web`                     | User responsive app                                     | static bundle/container                           |
| `admin`                   | 独立运营应用                                            | static bundle/container                           |
| `worker`                  | runtime AI、导出、同步 Job executor                     | container；私网 `/live`、`/ready`                 |
| `lexicon-compiler-runner` | `LEXICON_BUILD` Railway executor                        | container；Job result artifact reference          |
| `lexicon-importer`        | artifact preflight、COPY、release build/validation      | container/CLI；validated release reference/report |
| `lexicon-contracts`       | artifact schema/type/vocabulary/纯 validator            | root exports + JSON Schema                        |
| `lexicon-compiler`        | 来源解析、归一/归并、AI candidate、验证、单 JSON export | library API + CLI                                 |
| `api-client`              | User OpenAPI generated transport                        | browser-safe generated client                     |
| `admin-api-client`        | Admin OpenAPI generated transport                       | browser-safe generated client                     |
| `ai-provider`             | provider-neutral generation ports + DeepSeek adapter    | 分路径 exports；port 与 server adapter 分离       |
| `components`              | tokens/icons/styles/无领域 React primitives             | browser-safe React exports                        |
| `utils`                   | 无框架、无 I/O、跨 runtime 纯函数                       | root exports                                      |
| `database`                | Prisma schema/migration/client/connection factory       | server-only client/config/testing exports         |
| `background-jobs`         | JobKind/state/progress/checkpoint/handler contract      | implementation-neutral root exports               |
| `harness`                 | agent harness 文档、skill 与确定性检查器                | CLI/skill assets；不进入产品 runtime              |
| `docs`                    | VitePress 架构/产品/运维文档                            | static documentation site                         |
| `components-docs`         | Storybook、UI visual/a11y contract                      | static Storybook                                  |

### 4.1 `ai-provider` exports

```json
{
  "exports": {
    ".": "./dist/ports/index.js",
    "./contracts": "./dist/contracts/index.js",
    "./deepseek": "./dist/deepseek/index.js",
    "./testing": "./dist/testing/index.js"
  }
}
```

Compiler library 只能导入 `@sylis/ai-provider` 的 `.` 与 `./contracts` exports，Compiler Runner 与 Worker composition 才能导入 `./deepseek`。浏览器项目不能依赖任一路径。

### 4.2 generated clients

`api-client` 和 `admin-api-client` 的源码由 committed OpenAPI snapshot 确定性生成。手写内容只限 transport composition、auth/CSRF/idempotency/SSE helper；不手写重复 DTO。生成物变化必须与 API contract diff 在同一 PR 中审查。

## 5. Project tags

每个 project 具有一组 `type:*`、`scope:*`、`runtime:*` tag：

```text
type:app | type:service | type:lib | type:tool | type:docs
scope:platform | scope:lexicon | scope:learning | scope:reading | scope:ai | scope:operations | scope:ui
runtime:browser | runtime:server | runtime:node | runtime:neutral | runtime:docs
```

示例：

| Project                   | Tags                                              |
| ------------------------- | ------------------------------------------------- |
| `web`                     | `type:app`, `scope:platform`, `runtime:browser`   |
| `api`                     | `type:app`, `scope:platform`, `runtime:server`    |
| `lexicon-compiler`        | `type:lib`, `scope:lexicon`, `runtime:node`       |
| `lexicon-compiler-runner` | `type:service`, `scope:lexicon`, `runtime:server` |
| `components`              | `type:lib`, `scope:ui`, `runtime:browser`         |
| `background-jobs`         | `type:lib`, `scope:platform`, `runtime:neutral`   |
| `database`                | `type:lib`, `scope:platform`, `runtime:server`    |

Scope tag 表示主要 owner，不授予跨层绕行权限。精确 package allowlist 比仅按 scope 更权威。

## 6. 允许依赖矩阵

| Consumer                  | 允许直接依赖                                                              |
| ------------------------- | ------------------------------------------------------------------------- |
| `web`                     | `api-client`, `components`, `utils`                                       |
| `admin`                   | `admin-api-client`, `components`, `utils`                                 |
| `api`                     | `database`, `background-jobs`, `utils`                                    |
| `worker`                  | `database`, `background-jobs`, `ai-provider`, `utils`                     |
| `lexicon-compiler-runner` | `lexicon-compiler`, `background-jobs`, `database`, `ai-provider`, `utils` |
| `lexicon-importer`        | `lexicon-contracts`, `background-jobs`, `database`, `utils`               |
| `lexicon-compiler`        | `lexicon-contracts`, `ai-provider` root ports/contracts、`utils`          |
| `api-client`              | browser-safe transport dependencies、`utils`                              |
| `admin-api-client`        | browser-safe transport dependencies、`utils`                              |
| `components`              | React/accessible primitive dependencies、`utils`                          |
| `database`                | Prisma/PostgreSQL/config dependencies；不依赖业务 project                 |
| `background-jobs`         | schema/validation 与 `utils`；不依赖实现 project                          |
| `docs`, `components-docs` | 文档构建依赖；Storybook 可消费 `components`                               |

全局禁止：

- browser runtime 依赖 server/node-only project。
- library 依赖 app/service。
- app/service deep import 另一个 app/service 的源码。
- API/Worker 依赖 compiler/importer。
- Compiler 与 Importer 互相依赖。
- `lexicon-contracts` 依赖任何 producer/consumer implementation。
- `database` 拥有或导出业务 repository。
- `background-jobs` 依赖 NestJS、Prisma、Redis、provider 或 Railway。
- 新增 `shared/common/core` 聚合包规避依赖规则。

## 7. Nx 配置基线

```json
{
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": [
      "default",
      "!{projectRoot}/**/*.spec.*",
      "!{projectRoot}/test/**/*"
    ],
    "sharedGlobals": [
      "{workspaceRoot}/pnpm-lock.yaml",
      "{workspaceRoot}/tsconfig.base.json",
      "{workspaceRoot}/eslint.config.js"
    ]
  },
  "targetDefaults": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"],
      "cache": true
    },
    "typecheck": { "dependsOn": ["^build"], "cache": true },
    "lint": { "cache": true },
    "test": { "dependsOn": ["^build"], "cache": true }
  }
}
```

实际配置需补齐每个 target 的 outputs。含真实网络、数据库写入、AI、部署、artifact publish、migration deploy 的 target 默认 `cache: false`；不能让 Nx cache 伪造外部副作用已经完成。Secret 不得作为普通命令参数或 cache output。

`@nx/enforce-module-boundaries` 配置 runtime/type/scope 约束。`tools/architecture` 再检查无法只靠 tag 表达的精确 allowlist、package exports、app source import 与 frontend module deep import。

## 8. 标准 targets

| Target              | 适用项目                              | 说明                              |
| ------------------- | ------------------------------------- | --------------------------------- |
| `lint`              | 全部代码项目                          | ESLint + dependency boundary      |
| `typecheck`         | TypeScript 项目                       | 无 emit                           |
| `test`              | library/app/service                   | unit                              |
| `test:integration`  | API/Worker/Runner/Importer/database   | 真实依赖容器；默认不 cache        |
| `build`             | 可构建 project                        | 声明准确 outputs                  |
| `contract`          | API/clients/contracts/background-jobs | schema/snapshot/consumer contract |
| `e2e`               | Web/Admin/API                         | 依赖已构建应用和隔离环境          |
| `artifact:validate` | contracts/compiler/importer           | 无网络、无数据库的纯 validation   |
| `db:generate`       | database                              | Prisma generate                   |
| `db:migrate:test`   | database/API/importer                 | fresh DB migration                |
| `docs:build`        | docs/components-docs                  | VitePress/Storybook               |

## 9. CI 使用方式

PR 快速反馈：

```bash
pnpm nx affected -t lint typecheck test build
```

它只用于缩短反馈，不是发布完整性证明。`main` 与受保护 `release/*` 必须运行：

```bash
pnpm nx run-many -t lint typecheck test build --all
pnpm nx run-many -t contract artifact:validate --all
pnpm nx run api:test:integration
pnpm nx run worker:test:integration
pnpm nx run lexicon-compiler-runner:test:integration
pnpm nx run lexicon-importer:test:integration
pnpm nx run web:e2e
pnpm nx run admin:e2e
pnpm nx run docs:build
```

部署 workflow 只消费同一 commit 已通过的不可变 image digest/static artifact，不在 deploy job 重新 build。Nx Cloud 如启用，token 只存 GitHub environment secret；fork PR 不获得写 cache 或 production secret。

## 10. Generator 与边界模板

`tools/generators` 提供少量受控 generator：

- `frontend-module`：创建 `model/api/components/index.ts`，不创建空 `store`。
- `nest-module`：创建 `<name>.module.ts`、controller/service/index 与 architecture test fixture。
- `workspace-lib`：创建 exports、tags、targets、README ownership。
- `job-handler`：生成 handler contract test，不复制状态机。

Generator 输出必须满足边界检查；它不替代设计决策。没有独立 build/deploy/public API 的 frontend module 不允许 generator 把它升级为 Nx project。

## 11. 当前 workspace 迁移映射

| 当前路径/机制                  | 目标                                                     |
| ------------------------------ | -------------------------------------------------------- |
| pnpm workspace                 | 保留；补齐 Nx project/target                             |
| root scripts 手写串行执行      | 逐步改为 `nx affected/run-many`，底层工具脚本保留        |
| `apps/api`                     | 保留项目；内部按 Nest module-first 重构                  |
| `apps/web`                     | 保留项目；内部按 pages/modules/components 规则重构       |
| 无 `apps/admin`                | 新建独立 app                                             |
| 无 `apps/worker`               | 新建独立 Nest app                                        |
| `services/vocabulary-importer` | 由 `services/lexicon-importer` 替换                      |
| 无 compiler runner             | 新建 `services/lexicon-compiler-runner`                  |
| `packages/shared`              | 删除；DTO/配置按 owner 迁移                              |
| `packages/utils`               | 保留并收窄为纯函数                                       |
| 无 components package          | 新建 `packages/components`；应用现有无领域组件经审核迁入 |
| 无 database package            | 新建 `packages/database`；迁移 `apps/api/prisma`         |
| 无 background-jobs package     | 新建 `packages/background-jobs`                          |
| 无 lexicon packages            | 新建 contracts/compiler                                  |
| 无 API client packages         | 新建 User/Admin generated clients                        |
| 无统一 project graph/boundary  | 引入 Nx tags、module-boundaries、architecture tests      |
| `packages/harness`             | 保留独立 tooling project，不进入产品 runtime graph       |

详细 app 内路径迁移分别见 [前端目录与模块边界](./frontend-structure.md) 与 [后端目录与 NestJS 模块边界](./backend-structure.md)。

## 12. 测试与验收

- `nx graph` 中无循环 project dependency。
- 每个 package 的 `exports` 与声明的 public API 一致，deep import architecture test 通过。
- `nx affected` 在已知变更 fixture 上覆盖所有受影响 consumer，不能漏掉 codegen/schema 依赖。
- 连续两次无变更 build 证明纯 target cache 命中；integration/deploy/publish target 证明不被错误 cache。
- Web/Admin bundle graph 不包含 database/background-jobs executor/compiler/provider adapter。
- API/Worker/Runner/Importer image 只包含各自运行依赖，不通过 root context 把 `.work`、source dump、`img.zip` 或本地未跟踪文件打入镜像。
- CI 在无业务 secret 的 PR 环境可完成 lint/typecheck/unit/build/contract/docs；需要真实 secret 的操作只在 protected environment 执行。
- 删除 `@sylis/shared` 后全仓无 import、path alias、lockfile workspace dependency 或文档残留。

## 13. 完成条件

1. 所有 app/service/package 都在 Nx project graph 中，tags、targets 与 outputs 准确。
2. pnpm 是唯一 package manager，Nx 是唯一 monorepo task/project graph 工具。
3. 跨 project 边界由机器检查，app 内 module 边界由 ESLint/architecture test 检查。
4. `@sylis/shared` 已删除且没有等价的 `common/core` 聚合包回流。
5. PR 使用 `affected` 提速，主线/发布仍完成全量 contract、integration、e2e 与 docs 门禁。
