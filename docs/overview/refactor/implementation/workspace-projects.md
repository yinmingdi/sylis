# Workspace 项目图与 Turbo 治理

## 1. 工具职责

- pnpm 是唯一 package manager，负责 lockfile、workspace protocol、包发现和 script 执行。
- Turborepo 是唯一 monorepo orchestrator，负责任务图、并行、cache 与 affected 计算。
- Vite 构建 frontend；Nest CLI + SWC 构建 HTTP backend；各项目 `tsc -p tsconfig.build.json` 构建简单 Node app 和 library 并独立 typecheck。Turbo 负责跨项目依赖顺序，不维护第二份根 TypeScript reference graph。
- Prisma、Vitest/Jest、Playwright 和文档工具执行各自任务，Turbo 只编排。
- 不使用 Nx、tsup、tsdown 或第二套项目图。

TypeScript workspace/local import 始终省略 `.js`/`.ts` 后缀。应用直接构建自己的部署产物；library 只有在真实 consumer 需要产物时才建立 build task，不为“看起来统一”增加 bundler。

## 2. 完整 workspace

```text
.
├── apps/
│   ├── frontends/
│   │   ├── web/                       @sylis/web
│   │   └── admin/                     @sylis/admin
│   └── backends/
│       ├── api/                       @sylis/api
│       ├── admin-api/                 @sylis/admin-api
│       ├── agent-api/                 @sylis/agent-api
│       ├── model-gateway/              @sylis/model-gateway
│       ├── agent-executor/            @sylis/agent-executor
│       ├── agent-evaluator/           @sylis/agent-evaluator
│       ├── asset-processor/            @sylis/asset-processor
│       ├── automation-executor/       @sylis/automation-executor
│       ├── lexicon-builder/           @sylis/lexicon-builder
│       └── lexicon-publisher/         @sylis/lexicon-publisher
├── packages/
│   ├── api-client/                    @sylis/api-client
│   ├── agent-contracts/               @sylis/agent-contracts
│   ├── agent-runtime/                 @sylis/agent-runtime
│   ├── components/                    @sylis/components
│   ├── content-crypto/                @sylis/content-crypto
│   ├── database/                      @sylis/database
│   ├── job-contracts/                 @sylis/job-contracts
│   ├── job-runtime/                   @sylis/job-runtime
│   ├── lexicon-artifact/              @sylis/lexicon-artifact
│   ├── lexicon-compiler/              @sylis/lexicon-compiler
│   ├── test-support/                   @sylis/test-support
│   └── utils/                         @sylis/utils
├── tools/
│   ├── engineering-harness/
│   ├── architecture/
│   ├── generators/
│   └── scripts/
├── docs/
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── eslint.config.js
```

每个 app 都产生独立容器或静态站点。不可部署的 runner/library 不进入 `apps`；不再保留 `services/`、generic `worker`、`user-api`、`admin-web`、`compiler-runner` 或 `lexicon-importer`。

## 3. Package interface

| Package            | Public interface                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `api-client`       | `./user`、`./admin`、`./agent` 三个 OpenAPI 生成客户端和 transport primitives                          |
| `agent-contracts`  | Agent Step/action/receipt、MessageBlock/event、tool、proposal、artifact、私人练习和 capability schemas |
| `agent-runtime`    | `AgentRuntime.activate` 与注入的 Model/Step/Tool ports；不导出内部 assembler/scheduler classes         |
| `components`       | tokens、icons、styles 和无领域 React primitives                                                        |
| `content-crypto`   | encrypt/decrypt/redact/key-version interfaces 与 server adapters                                       |
| `database`         | Prisma schema/migration/generated client/connection；server-only                                       |
| `job-contracts`    | Job kind/state/progress/checkpoint/result schema；runtime-neutral                                      |
| `job-runtime`      | claim/lease/heartbeat/fencing/drain 的小型 executor interface                                          |
| `lexicon-artifact` | JSON Schema、受控词表、类型和纯验证器                                                                  |
| `lexicon-compiler` | compile/validate/write 接口；不暴露 source pipeline internals                                          |
| `test-support`     | E2E 环境、覆盖矩阵、OpenAPI 覆盖与确定性测试运行时                                                     |
| `utils`            | 无框架、无 I/O、确定性跨 runtime 纯函数                                                                |

`agent-runtime` 是产品 Agent 的框架无关运行时；`tools/engineering-harness` 是开发代理、仓库检查与文档事实生成工具。两者不共享生命周期、配置或运行时依赖。

## 4. 精确依赖

| Consumer              | 允许的主要 workspace 依赖                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `web`                 | `api-client`, `agent-contracts`, `components`, `utils`                                       |
| `admin`               | `api-client`, `components`, `utils`                                                          |
| `api`                 | `database`, `content-crypto`, `job-contracts`, `utils`                                       |
| `admin-api`           | `database`, `job-contracts`, `utils`                                                         |
| `agent-api`           | `agent-contracts`, `database`, `content-crypto`, `job-contracts`, `utils`                    |
| `model-gateway`       | `database`, `content-crypto`, `job-contracts`, `utils`; Provider SDK 只作为本 app dependency |
| `agent-executor`      | `agent-contracts`, `agent-runtime`, `job-contracts`, `job-runtime`, `utils`                  |
| `agent-evaluator`     | `agent-contracts`, `agent-runtime`, `job-contracts`, `job-runtime`, `utils`                  |
| `asset-processor`     | `database`, `content-crypto`, `job-contracts`, `job-runtime`, `utils`                        |
| `automation-executor` | `job-contracts`, `job-runtime`, `database`, `utils`                                          |
| `lexicon-builder`     | `lexicon-compiler`, `job-contracts`, `job-runtime`, `database`, `utils`                      |
| `lexicon-publisher`   | `lexicon-artifact`, `job-contracts`, `job-runtime`, `database`, `utils`                      |
| `agent-runtime`       | `agent-contracts`, `utils`                                                                   |
| `job-runtime`         | `job-contracts`, `database`, `utils`                                                         |
| `lexicon-artifact`    | `utils`                                                                                      |
| `lexicon-compiler`    | `lexicon-artifact`, `utils`; structured generation 只接收自己定义的注入 port                 |
| `test-support`        | `utils`；测试基础设施依赖只服务于验证，不进入生产应用                                        |
| `components`          | browser dependencies、`utils`                                                                |

全局禁止：browser 依赖 server-only package；package 依赖 app；app-to-app 源码 deep import；compiler 与 publisher implementation 互相依赖；contract 依赖 producer；以及新增 `shared/common/core` 聚合包。

`agent-executor` 不依赖 `database` 业务 client。它通过 `job-runtime` 只访问 Job/Attempt 租约，并为 `agent-runtime` 装配调用 `agent-api` 的 Step port、调用 Model Gateway 的 Model port 和受控 Tool port；数据库角色同时阻止其写 Agent 和产品表。`agent-runtime` 不依赖 NestJS、Cordis、Provider SDK 或数据库。

不存在 `@sylis/model-runtime`。Agent Executor、Evaluator、Lexicon Builder 和 Asset Processor 通过各自 app 内的小型 typed HTTP adapter 调用 Model Gateway；只有 Model Gateway 的 composition root 依赖 Provider SDK。不能为共享 SDK DTO 重新建立 provider package。

## 5. `package.json` 和 exports

项目图只来自 `package.json`：

- workspace 依赖使用 `workspace:*`；
- 可消费 package 用 `exports` 声明稳定 subpath；
- 禁止相对路径跨 package、TypeScript path alias 绕过 exports 或导入其他项目的 `src/**`；
- 每个可调度任务是 package script，`turbo.json` 只声明依赖、inputs、outputs 和 cache policy；
- 没有独立 build/deploy/interface 的 app 内 module 不升级为 workspace package。

## 6. Turbo 基线

```json
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "lint": { "outputs": [] },
    "dev": { "cache": false, "persistent": true },
    "db:migrate": { "cache": false },
    "lexicon:build": { "cache": false },
    "lexicon:publish": { "cache": false },
    "deploy": { "cache": false }
  }
}
```

网络、数据库写入、模型调用、Artifact publish、migration、deploy、watch 和常驻服务永不缓存。Secret 不能进入 task 参数、cache key、Artifact 或日志。

## 7. 构建策略

| 类型                   | 构建方式                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| React frontend         | `vite build` + `tsc --noEmit`                                       |
| Nest HTTP backend      | Nest CLI + SWC + 独立 `tsc --noEmit`                                |
| 简单 executor          | `tsc -p tsconfig.build.json`，容器运行已编译 JS                     |
| TypeScript library     | `tsc -p tsconfig.build.json` 输出声明与 JS，由 package exports 暴露 |
| Schema/code generation | 所属 package 的显式 script                                          |

是否生成 ESM/CJS 双格式由实际外部 consumer 决定；v1 内部 workspace 不为假设 consumer 保留 tsup/tsdown。发布给第三方的 lexicon 数据契约是 JSON/Schema，而不是要求他们加载 Sylis JS bundle。

## 8. 架构门禁

`tools/architecture/check-workspace.mjs` 必须验证：

1. pnpm 发现的 app/package 与集中清单一致；
2. 所有 import 都有直接 dependency、合法 exports 且不跨禁止边；
3. workspace/local TypeScript import 省略源码扩展名；
4. frontend bundle 不包含 database、content-crypto server adapter、executor、compiler 或 provider adapter；Provider SDK 只能出现在 `model-gateway`；
5. compiler 不依赖 Nest、Prisma、Redis、Railway 或 production DB；
6. executor 数据库角色与静态 import 都不能写越权领域表；Model Gateway 也不能写 Agent/Learning/Lexicon/Reading truth；
7. Docker context 排除 `.work`、源码 dump、`img/`、`img.zip` 和本地未跟踪文件。

## 9. CI 使用

PR 使用 Turbo affected 缩短反馈；protected `main` 使用全量门禁。required workflow 不使用会跳过汇总检查的 path filter。部署只消费同 commit 已验证的 GHCR digest，不在 deploy job 重建或重新解释源码。

普通 CI 使用 Model Gateway fake-provider server 与固定 fixture，不读取 Railway、模型或 User BYOK secret。真实 Lexicon 200 词 pilot 和全量生成只能走显式、受保护、人工触发流程。
