# Workspace 项目图与 Turbo 治理

## 1. 工具职责

Sylis 使用一套任务图，不叠加多个 monorepo orchestrator：

- pnpm 负责依赖安装、lockfile、workspace protocol、包发现和 script 执行。
- Turborepo 从 `package.json` 的 workspace 依赖和 scripts 建立任务图，负责拓扑排序、并行、cache 与 `--affected`。
- Vite、Nest/SWC、tsdown、tsc、Prisma、Vitest、Jest 和 Playwright 负责实际编译、生成与测试；Turbo 不替代这些工具。
- `tools/architecture/check-workspace.mjs` 负责精确 package allowlist、直接依赖声明、package exports、源码导入和副作用任务缓存规则。
- ESLint 负责单个 package 内部的代码规则与 app module restricted imports。

Turbo 不承担通用代码生成或领域边界判断。项目边界只在 package 具有独立 build、test、publish、deploy 或 public API 时成立；`apps/web/src/modules/lexicon` 等 app 内 module 不是 workspace package。

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
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── eslint.config.js
```

`packages/shared` 不在目标 workspace。Transport type 归生成的 API clients；artifact contract 归 `lexicon-contracts`；Job contract 归 `background-jobs`；数据库类型归 server-only `database`；UI 归 `components`；跨 runtime 纯函数归 `utils`。

## 3. Package 合同

每个 workspace package 至少包含 `package.json` 和所属工具的配置。TypeScript package 通常包含 `tsconfig.json` 与 `src/`；测试可放在 `test/` 或与源码共置。

`package.json` 是项目图唯一来源：

- `name` 是稳定 package identity。
- workspace 依赖必须使用 `workspace:*` 或仓库规定的 workspace range。
- 可消费 package 必须用 `exports` 声明 public entry points。
- 每项可调度能力必须是 package script；`turbo.json` 只描述任务关系、inputs、outputs 与 cache policy。
- 禁止用 TypeScript path alias、相对路径或 `src/**` deep import 绕过 package exports。

不为 Turbo 增加逐包元数据文件。Scope/runtime/owner 是架构文档和集中 allowlist 的属性，不复制到每个目录。

## 4. 所有权与公开表面

| Package                   | Owner/职责                                         | Public surface / 输出                  |
| ------------------------- | -------------------------------------------------- | -------------------------------------- |
| `api`                     | User/Admin HTTP、同步 command/query、Job client    | OpenAPI 3.1 snapshots、container image |
| `web`                     | User responsive app                                | static bundle/container                |
| `admin`                   | 独立运营应用                                       | static bundle/container                |
| `worker`                  | runtime AI、导出、同步 Job executor                | container；私网 `/live`、`/ready`      |
| `lexicon-compiler-runner` | `LEXICON_BUILD` executor                           | container；artifact reference          |
| `lexicon-importer`        | artifact preflight、COPY、release validation       | container/CLI；release report          |
| `lexicon-contracts`       | artifact schema/type/vocabulary/纯 validator       | ESM exports + JSON Schema              |
| `lexicon-compiler`        | 来源解析、归一、AI candidate、验证、单 JSON export | library API + executable CLI           |
| `api-client`              | User OpenAPI generated transport                   | browser-safe generated client          |
| `admin-api-client`        | Admin OpenAPI generated transport                  | browser-safe generated client          |
| `ai-provider`             | provider-neutral ports + DeepSeek adapter          | 分路径 ESM exports                     |
| `components`              | tokens/icons/styles/无领域 React primitives        | browser-safe React exports             |
| `utils`                   | 无框架、无 I/O、跨 runtime 纯函数                  | ESM + CJS conditional export           |
| `database`                | Prisma schema/migration/client/connection          | server-only exports                    |
| `background-jobs`         | JobKind/state/progress/checkpoint/handler contract | neutral exports                        |
| `harness`                 | agent harness 与确定性检查器                       | CLI/skill assets，不进入 runtime       |
| `docs`                    | VitePress 架构/产品/运维文档                       | static documentation site              |
| `components-docs`         | Storybook visual/a11y contract                     | static Storybook                       |

`ai-provider` 的 `.` 与 `./contracts` 可被 compiler library 消费；`./deepseek` 只允许 composition root、runner 或 worker 消费；浏览器 package 禁止依赖任何 provider adapter。

## 5. 精确依赖边界

| Consumer                  | 允许直接依赖                                                              |
| ------------------------- | ------------------------------------------------------------------------- |
| `web`                     | `api-client`, `components`, `utils`                                       |
| `admin`                   | `admin-api-client`, `components`, `utils`                                 |
| `api`                     | `database`, `background-jobs`, `utils`                                    |
| `worker`                  | `database`, `background-jobs`, `ai-provider`, `utils`                     |
| `lexicon-compiler-runner` | `lexicon-compiler`, `background-jobs`, `database`, `ai-provider`, `utils` |
| `lexicon-importer`        | `lexicon-contracts`, `background-jobs`, `database`, `utils`               |
| `lexicon-compiler`        | `lexicon-contracts`, `ai-provider` ports/contracts、`utils`               |
| `components`              | browser dependencies、`utils`                                             |
| `database`                | Prisma/PostgreSQL/config dependencies                                     |
| `background-jobs`         | schema/validation、`utils`                                                |

全局禁止 browser 依赖 server-only package、library 依赖 app/service、app 之间 deep import、compiler/importer 互相依赖、contract 依赖 producer/consumer implementation，以及新增 `shared/common/core` 聚合包。

`check-workspace.mjs` 必须同时验证：

1. pnpm 实际发现的 workspace package 与集中清单完全一致。
2. 所有源码导入的第三方包都在所属 `package.json` 直接声明。
3. `@sylis/*` import 同时满足 allowlist、workspace dependency 和 package export。
4. 相对导入不跨 package，workspace/local TypeScript 导入省略源码扩展名。
5. Compiler 不能依赖 NestJS、Prisma、Redis、PostgreSQL 或 Railway SDK。

## 6. Turbo 任务基线

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "schema/**"]
    },
    "typecheck": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    },
    "lint": { "outputs": [] },
    "dev": { "cache": false, "persistent": true },
    "db:migrate": { "cache": false },
    "compile": { "cache": false },
    "deploy": { "cache": false }
  }
}
```

`typecheck` 与 `test` 依赖本 package 的 `build`，避免 generated contract、declaration 或上游 package 尚未完成时并发消费半成品。Turbo 会去重同一次运行中的 build task。

任何真实网络、数据库写入、AI 调用、artifact publish、migration、deploy、watch 或常驻服务任务必须 `cache: false`。Secret 只能通过 CI secret/environment 注入，不能成为命令参数、artifact 或日志。

## 7. 构建工具决策

| 项目类型                             | 构建器                                    |
| ------------------------------------ | ----------------------------------------- |
| Nest application                     | Nest CLI + SWC；独立 TypeScript typecheck |
| Vite application                     | Vite production build                     |
| Node ESM library/CLI、双格式 library | tsdown + 独立 `tsc --noEmit`              |
| 简单 server service                  | `tsc`/`tsc -b`                            |
| Schema/code generation               | 所属 package 的显式 script                |

源码保留 extensionless local imports，而 Node ESM runtime 要求文件扩展名，因此可执行的 ESM library/CLI 继续需要 bundling。Turbo 只编排，不能替代 tsdown。

## 8. CI 使用方式

PR 必须 checkout 完整比较范围并设置 `TURBO_SCM_BASE` 与 `TURBO_SCM_HEAD`：

```bash
pnpm ci:affected
```

`develop`、`main` 与 `release/**` push 执行：

```bash
pnpm ci:full
```

required workflow 不使用 workflow-level path filters。Secret scan、policy/harness 与 quality 并行，最后由 `if: always()` 的稳定汇总 job 判断全部结果。Phase 0/1 是手动里程碑 gate，不进入普通 PR 串行路径。

本地 cache 默认启用；未配置受保护的 remote cache 前不共享可写 cache。部署只消费同 commit 已验证的 image digest/static artifact，不在 deploy job 重新解释源码状态。

## 9. Generator 与边界模板

`tools/generators` 只提供少量模板：

- `frontend-module`：创建 `model/api/components/index.ts`，不创建空 store。
- `nest-module`：创建 module/controller/service/index 与边界 fixture。
- `workspace-package`：创建 package scripts、exports、tsconfig 和 allowlist 变更。
- `job-handler`：生成 handler contract test，不复制状态机。

Generator 输出必须通过架构检查；没有独立 build/deploy/public API 的 app module 不得升级为 workspace package。

## 10. 当前迁移映射

| 当前路径/机制                       | 目标                                                    |
| ----------------------------------- | ------------------------------------------------------- |
| pnpm workspace                      | 保留，作为 package graph 来源                           |
| root 手写串行脚本                   | 改为 Turbo task graph，底层工具脚本保留                 |
| `apps/api`                          | 保留；内部按 Nest module-first 重构                     |
| `apps/web`                          | 保留；内部按 pages/modules/components 重构              |
| `services/vocabulary-importer`      | 由 `services/lexicon-importer` 替换                     |
| `packages/shared`                   | 删除；DTO/配置迁到明确 owner                            |
| `packages/utils`                    | 保留并收窄为纯函数                                      |
| 无 admin/worker/runner              | 按部署边界新增独立 app/service                          |
| 无 components/database/jobs package | 按 owner 新建，不建立聚合 common package                |
| 无统一边界检查                      | 使用集中 allowlist、exports 与 import architecture test |

## 11. 测试与完成条件

- Turbo task graph 无循环，已知变更能覆盖所有下游 consumer。
- 连续两次无变更 build 命中纯任务 cache；副作用任务永不报告 cache hit。
- 所有 package exports 的 JS、declaration、CJS/ESM 条件和 CLI 入口可真实加载。
- Web/Admin bundle 不包含 database、job executor、compiler 或 provider adapter。
- Runtime image 不包含 `.work`、source dump、`img.zip` 或本地未跟踪文件。
- PR 在没有业务 secret 时完成 lint/typecheck/unit/build/contract/docs；真实 AI 与生产写入只在 protected environment 执行。
- package 边界由机器检查，app 内 module 边界由 ESLint 与 architecture tests 检查。
- pnpm 是唯一 package manager，Turborepo 是唯一 monorepo task orchestrator。
