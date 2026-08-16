# CI 与 TypeScript 构建工具研究

更新时间：2026-08-05

## 1. 决策摘要

Sylis 使用 pnpm workspace + Turborepo，不使用 Nx：

- pnpm 是 package manager 和 workspace package graph 的事实源。
- Turbo 消费现有 `package.json` scripts 和 workspace dependencies，负责任务依赖、并行、cache 和 affected selection。
- 精确 package allowlist、exports、直接依赖与源码 import 规则由 `tools/architecture/check-workspace.mjs` 执行，不把架构边界绑定到 task runner plugin。
- Nest、Vite、tsc、Prisma 和测试框架仍负责实际工作。

最终 workspace 不保留 `tsup` 或 `tsdown`。Vite 和 Nest/SWC 构建应用，简单 Node app 与内部 library 使用各项目的 `tsc -p tsconfig.build.json`，依赖顺序由 Turbo workspace graph 负责；只有未来出现真实外部 JS consumer 且 `tsc` 无法满足其 format contract 时，才为那个 package 单独评估 bundler。

## 2. 为什么选择 Turbo

Sylis 当前 workspace 已经用 pnpm filters 和 package scripts 组织命令。原 Nx 配置没有被 CI task execution 使用，却要求每个 package 额外维护 `project.json`、tags、targets 与 ESLint plugin。Turbo 直接从 package manifests 建图，减少一套重复项目元数据。

Turbo 官方任务配置支持：

- `dependsOn: ["^build"]` 按 workspace dependency 先构建上游；
- 为纯任务声明 outputs 并缓存；
- 为 dev、database、AI、publish、deploy 等副作用任务设置 `cache: false`；
- 使用 `turbo run ... --affected` 选择 Git base/head 之间发生变化的 package 及消费者；
- 使用 `TURBO_SCM_BASE` 与 `TURBO_SCM_HEAD` 覆盖默认 `main...HEAD` 比较范围。

来源：[Configuring tasks](https://turborepo.com/docs/crafting-your-repository/configuring-tasks)、[`turbo run`](https://turborepo.com/docs/reference/run)、[Caching](https://turborepo.com/docs/crafting-your-repository/caching)

Turbo 和 pnpm 的边界必须保持清楚：pnpm 负责安装与 workspace dependencies，Turbo 只调度 package scripts。Turbo 也不替代 architecture tests；package runtime/owner 约束不是 build cache concern。

## 3. CI 实测问题

GitHub Actions run `30967844682` 的历史实测：

| 步骤                            |       时间 | 结论                         |
| ------------------------------- | ---------: | ---------------------------- |
| Harness dependency install      |      14 秒 | 不是瓶颈                     |
| Artifact contract gate          |  3 分 9 秒 | 每个 PR 重跑历史里程碑       |
| Lexicon compiler gate           | 1 分 25 秒 | 串行重复 package checks      |
| Quality service/init            |      38 秒 | 被 `needs: harness` 延后     |
| Quality dependency install      |       5 秒 | pnpm cache 已有效            |
| `@sylis/utils` 旧 bundler build |    约 2 秒 | bundler 不是五分钟等待的原因 |

因此 CI 优化不是换一个更快的 installer，而是：

1. Secret scan、policy/harness 与 quality 并行。
2. Artifact contract 与 lexicon compiler 专项门禁保留为按需审计，不进入普通 PR 串行路径。
3. PR 使用 Turbo affected；受保护分支 push 运行全量 task graph。
4. 同一 job 内让 Turbo 去重并缓存重复 build。
5. 用稳定的 `CI required` aggregate job 汇总结果。

## 4. GitHub required check 约束

Required workflow 不使用 workflow-level `paths` 或 `paths-ignore`。GitHub 官方说明，workflow 因路径过滤而跳过时，关联检查可能保持 Pending 并阻止合并。Workflow 应始终触发，再由 affected selection 减少任务。[GitHub workflow filters](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)、[Required status checks troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)

Aggregate job 使用 `if: always()`，并明确要求 secret scan、policy 与 quality 都为 success。PR concurrency 可以取消同一 PR 的过时运行；production deployment 使用独立 concurrency，不套用可取消的 PR 规则。[GitHub job conditions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions)、[GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

`actions/setup-node` 的 pnpm cache 缓存 package store，不缓存 `node_modules`，也不能保存 secret。[GitHub dependency caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)、[pnpm CI](https://pnpm.io/continuous-integration)

## 5. 为什么不保留通用 library bundler

最终目标都是仓库内 consumer 或数据 Artifact consumer：

| 项目类型                | 构建方式                                          |
| ----------------------- | ------------------------------------------------- |
| React frontend          | Vite + 独立 `tsc --noEmit`                        |
| Nest HTTP backend       | Nest CLI + SWC + 独立 typecheck                   |
| 简单 executor           | `tsc -p tsconfig.build.json`，容器运行已编译 JS   |
| 内部 TypeScript library | `tsc -p tsconfig.build.json` 输出 package exports |
| 第三方 Lexicon consumer | JSON Schema + `.json.zst`，不要求加载 JS bundle   |

源码保持 extensionless local/workspace import；运行时 module format 由对应 app 的构建配置统一处理。这样不用为所有 package 同时维护 bundler config、exports matrix 和 declaration pipeline。Turbo 仍只编排任务，不替代 Vite、SWC 或 TypeScript compiler。

## 6. Nest 构建调查

失败反馈环：

```text
pnpm --filter @sylis/api build
Error Debug Failure
```

历史调查中普通 `tsc` 通过、关闭 `@nestjs/swagger` CLI plugin 后 `nest build` 通过，因此故障位于 Nest TSC plugin path，而不是 TypeScript、Nx、Turbo 或 workspace import。最终路径迁到 `apps/backends/api` 后仍使用相同 SWC + 独立 typecheck 结论。

Nest 官方 SWC recipe 说明 SWC 不自行 typecheck；使用 Nest CLI plugins 时应启用 `--type-check`。验证命令 `nest build --builder swc --type-check` 成功编译 157 files，并保留 Swagger plugin 的 type-check/metadata 阶段。[Nest SWC recipe](https://docs.nestjs.com/recipes/swc)、[Nest CLI scripts](https://docs.nestjs.com/cli/scripts)

最终 API build 使用 SWC + plugin type-check，Turbo 另执行独立 `tsc --noEmit`。SWC 输出入口是 `dist/main.js`，所有 production/job scripts 必须与该输出路径一致。

## 7. 目标 CI 拓扑

### Pull request

1. `Secret scan`：完整历史 Gitleaks。
2. `Harness and documentation`：harness、workspace architecture、workflow policy、docs contract、diff whitespace。
3. `Build and test`：设置精确 `TURBO_SCM_BASE/HEAD`，执行 `pnpm ci:affected`，再运行 fresh database、import idempotency、API/Web smoke。
4. `CI required`：始终运行并汇总前三项。

### Protected branch push

执行 `pnpm ci:full`、fresh migration、integration 和 image smoke。真实 AI pilot、全量 lexicon build、production import 与 activation 仍属于受保护独立 workflow。

### 专项门禁

Artifact contract 使用 `pnpm artifact:validate`，lexicon compiler 使用 `pnpm lexicon:check`。长期有效断言进入正常 lint/typecheck/test/build/contract targets，不再暴露按实施阶段编号的命令。

## 8. Cache 安全

- 纯 lint/typecheck/test/build/docs 可以缓存，outputs 必须准确。
- dev/watch/start、database、AI、compiler run、publish、deploy 永不缓存副作用完成状态。
- 没有受保护 remote cache 之前只使用 runner 本地 cache。
- Fork PR 不获得 production secret 或 remote cache write token。
- Secret value 不写入 command line、artifact、cache output 或日志。

## 9. 验收证据

- `pnpm architecture:check` 证明 pnpm package graph、allowlist、exports 与 Turbo cache policy。
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` 通过。
- Vite、Nest/SWC 与各项目 `tsc -p tsconfig.build.json` 的输出路径和 package exports 一致。
- Utils、Artifact contracts 与 compiler CLI 可被真实 consumer 加载；Provider SDK 只存在于 Model Gateway image。
- 连续两次 Turbo build 的第二次命中本地 cache。
- API SWC build、Jest、fresh migration 和 health smoke 通过。
- GitHub Actions 不再串行重复历史里程碑；专项门禁仍可通过正式职责命令运行。
