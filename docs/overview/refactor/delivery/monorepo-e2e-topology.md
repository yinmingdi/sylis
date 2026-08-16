# Monorepo 端到端测试拓扑

## 1. 决策

Sylis v0.0.1 建立一个由仓库根任务拥有的非部署型 `tests/e2e` test project，由 Playwright 驱动真实的十二个应用；它不是 workspace package，也不改变“十二个 app、十二个 package”的清单，其中 `@sylis/test-support` 承载可复用的测试工具。测试基础设施使用一份专用 Docker Compose，包含 PostgreSQL、Redis、MinIO、ClamAV 和确定性 fake Provider。普通 E2E 启动真实 Model Gateway，并让它选择 fake Provider adapter，不能 mock 掉 Gateway，也不能调用付费模型。

每个本地执行或 GitHub Actions shard 独占一个 Compose project、网络、数据库、volume 和 Bucket namespace。禁止多个 shard 共用 PostgreSQL schema、Redis DB、MinIO Bucket 或测试账号。Docker Compose 仅保证容器已经启动，不代表服务可用，因此每个基础设施和应用必须有 healthcheck，依赖关系使用 `service_healthy`；database-install/seed 使用一次性容器，并以 `service_completed_successfully` 阻止应用在数据库未完成时启动。[Docker 官方文档](https://docs.docker.com/compose/how-tos/startup-order/)明确区分了 started 与 ready，并定义了这两种 dependency condition。

`tests/e2e` 不进入十二个 image，也不放进 `apps/`。它拥有：

```text
tests/e2e/
├── compose.e2e.yml
├── playwright.config.ts
├── fixtures/
│   ├── accounts.ts
│   ├── assets.ts
│   ├── data.ts
│   └── stack.ts
├── setup/
│   ├── database-install.setup.ts
│   └── seed.setup.ts
├── specs/
│   ├── user/
│   ├── admin/
│   ├── agent/
│   ├── accessibility/
│   ├── smoke/
│   └── system/
├── diagnostics/                 # gitignored、脱敏后才允许上传
└── teardown/
    └── stack.teardown.ts

tests/deployment/
├── playwright.config.ts         # staging/production synthetic smoke
└── shell.smoke.spec.ts
```

## 2. 被测系统

单个 shard 的拓扑如下。浏览器只能访问 Web/Admin 和公开 API；executor 及内部 API 通过 Compose 私有网络访问，不能为了测试暴露生产中不存在的浏览器入口。

```text
Playwright
  |-- Web ------> API ---------> PostgreSQL / Redis / MinIO
  |                 |
  |                 +---------> Agent API <---- Agent Executor
  |-- Admin ---> Admin API -----|    |          Agent Evaluator
                                |    +--------> Asset Processor ---> ClamAV
                                |
                                +------------> Model Gateway ------> fake Provider
                                |
                                +------------> Automation Executor
                                +------------> Lexicon Builder
                                +------------> Lexicon Publisher
```

同一 Compose 文件构建并启动十二个应用：`web`、`admin`、`api`、`admin-api`、`agent-api`、`model-gateway`、`agent-executor`、`agent-evaluator`、`asset-processor`、`automation-executor`、`lexicon-builder`、`lexicon-publisher`。所有 backend 都提供独立 liveness/readiness；ready 必须代表其必要依赖可用，而不是仅代表端口监听。

database install 和 seed 使用 database owner 连接；运行时直连数据库的 `api`、`admin-api`、`agent-api`、`model-gateway`、`automation-executor`、`lexicon-builder`、`lexicon-publisher` 分别通过连接参数进入自己的 PostgreSQL service role。`agent-executor`、`agent-evaluator` 和 `asset-processor` 的 E2E 容器不接收 `DATABASE_URL`，只通过受限内部 API 提交语义 command。workspace 架构门禁静态核对这份映射，database invariant integration 再证明越权表访问被 PostgreSQL 拒绝。

本地可以由 Testcontainers Node 的 `DockerComposeEnvironment` 分配唯一 project name、启动指定服务并在进程退出时自动清理；它会优先等待 Compose/image healthcheck，否则才等待端口。[Testcontainers Compose 文档](https://node.testcontainers.org/features/compose/)还支持服务级 wait strategy 和默认自动清理，[wait strategy 文档](https://node.testcontainers.org/features/wait-strategies/)支持 health、HTTP、日志、命令及组合就绪条件。CI 可以直接运行同一 Compose 文件；两条路径必须共享 image、healthcheck、database install 和 seed，不维护第二套拓扑。

## 3. 启动、安装与清理

执行顺序固定为：

1. 生成 `runId`/`shardId`，据此生成 Compose project、数据库名、Bucket prefix、端口和仅本次执行有效的测试密钥。
2. 启动 PostgreSQL、Redis、MinIO、ClamAV、fake Provider，等待 healthcheck。
3. 从空库运行 v0.0.1 database install；校验 Prisma schema 与 invariant hash，失败立即停止。
4. 运行确定性 seed：固定 200 词 artifact、七种 Operator role、测试 capability/tool release 和无真实凭据的 fake route。
5. 启动十二个应用，等待所有 readiness；保存不含 secret 的 endpoint manifest。
6. Playwright worker-scoped fixtures 创建每个 worker 独立的 User/Admin 身份及 storage state。
7. 运行 API、Web、Admin、Agent 与 system journeys。
8. 无论成功、失败或取消，都收集受控诊断后 `compose down --volumes --remove-orphans`。

不要用固定 sleep 判断就绪。Playwright `webServer` 可以启动一个或多个本地 server、轮询 URL 并在结束时发出 `SIGTERM`，[官方 webServer 文档](https://playwright.dev/docs/test-webserver)也建议 CI 禁止复用已存在 server。Sylis 应让 `webServer` 只启动一个长期存活的 stack controller；controller 管理 Compose、暴露聚合 `/ready`，并在 `SIGTERM` 时清理整套环境。CI 若在 Playwright 之前显式启动 Compose，则 Playwright 只消费 endpoint manifest，不能再启动第二套 stack。

迁移和 seed 使用 Playwright project dependencies，而不是不可观测的全局脚本。依赖项目先执行，失败时浏览器项目不会运行，并且 setup 的步骤、fixture 和 trace 都会进入报告，这是 [Playwright projects/dependencies](https://playwright.dev/docs/test-projects) 的原生执行模型。认证不放进共享 setup project；会修改服务端状态的身份由 consumer project 的 worker-scoped fixture 创建。

## 4. Playwright projects

推荐项目图：

| Project                  | 依赖                     | 并行策略       | 责任                                                        |
| ------------------------ | ------------------------ | -------------- | ----------------------------------------------------------- |
| `setup:database-install` | stack ready              | 单次           | 证明 Prisma schema + SQL-only invariants 空库安装成功       |
| `setup:seed`             | `setup:database-install` | 单次           | 导入固定 artifact 和 policy fixture                         |
| `web:desktop`            | `setup:seed`             | fully parallel | worker 独立身份与 User 公开桌面流程                         |
| `web:mobile`             | `setup:seed`             | fully parallel | worker 独立身份、移动流程和 responsive assertions           |
| `web:accessibility`      | `setup:seed`             | fully parallel | Chromium + axe，公开及登录后的 WCAG A/AA                    |
| `admin:desktop`          | `setup:seed`             | fully parallel | worker 独立多角色身份、Admin 控制面和权限拒绝               |
| `admin:accessibility`    | `setup:seed`             | fully parallel | Chromium + axe，Operator 登录及控制面 WCAG A/AA             |
| `agent:desktop`          | `setup:seed`             | fully parallel | worker 独立身份、SSE、tool、proposal、asset、consent        |
| `api:system`             | `setup:seed`             | fully parallel | 真实服务栈上的 API 权限、幂等、持久化和后台状态转换         |
| `browser:*:smoke`        | `setup:seed`             | fully parallel | PR/main 的 Firefox/WebKit Web/Admin shell 与静态资源        |
| `browser:*:nightly`      | `setup:seed`             | fully parallel | Firefox/WebKit 完整 User/Admin/Agent compatibility          |
| `system:exclusive`       | `setup:seed`             | `workers: 1`   | release activation、rollback、全局 policy、restart/failover |

Projects 适合表达浏览器、设备、环境和测试子集；dependencies 会在消费者之前运行并允许 setup 留下 trace，[Playwright 官方说明](https://playwright.dev/docs/test-projects)。desktop v0.0.1 必跑 Chromium；mobile 使用稳定的 Chromium device profile。Firefox/WebKit 放入 nightly compatibility workflow，避免把同一业务矩阵在每个 PR 三倍复制。视觉基线固定 Linux image、Playwright/browser 版本和 viewport。

测试验证用户可见行为，优先 role/label/text locator 和 web-first assertion，不依赖 CSS 结构或内部实现；Playwright 将这些列为稳定测试的[官方最佳实践](https://playwright.dev/docs/best-practices)。领域值必须使用契约/生成客户端导出的 enum，例如 `Audience`、`OperatorRole`、`JobKind`、`AgentWaitKind`、`ExerciseTaskKind`，禁止在 fixture 和 assertion 中复制魔法字符串。

## 5. 数据隔离与确定性

Playwright 为每个测试创建隔离 BrowserContext，但数据库、对象存储和后台队列仍是共享状态。官方并行指南建议用 `testInfo.testId` 生成记录标识，用 worker index 隔离后端数据；认证指南对会修改服务端状态的测试建议每个 parallel worker 使用独立账号。[并行隔离](https://playwright.dev/docs/test-parallel)与[认证隔离](https://playwright.dev/docs/auth)都不支持让并行测试复用可变账号。

Sylis 采用以下规则：

- shard 级：独占 PostgreSQL database、Redis namespace、MinIO Bucket prefix 和 fake-provider ledger；
- worker 级：独占 User、Admin、service grant、Agent Session root 和 auth storage 文件；
- test 级：ID、email、idempotency key、Job、Asset key、Session、Artifact 都从 `runId + shardId + parallelIndex + testId` 派生；
- immutable/audit 数据不在测试之间 truncate；通过 namespace 隔离，stack teardown 一次性销毁；
- 时间、UUID、fake stream、usage、429/timeout/abort 和 ClamAV 样本均使用固定 seed 或受控 fixture；
- 只有 `system:exclusive` 可修改全局 active release、route、budget、operator assignment 和 retention policy；这些场景仍各自恢复或销毁整个 shard；
- storage state 只写入项目 output directory，从不提交、缓存或作为报告 artifact 上传。

测试不得依赖前一个测试产生的数据。Playwright 明确要求测试可独立执行，以提高可复现性并防止级联失败。[官方 best practices](https://playwright.dev/docs/best-practices)同样要求数据库数据受测试方控制。

## 6. 最终流程矩阵

| 流程                | 必须穿过的真实边界                                                         | 关键断言                                                                                                      |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Web identity/study  | Web -> API -> DB/Redis                                                     | 注册、登录/MFA、session/CSRF、词典、13 task/四 renderer、四类真实提交、文本保留 consent、FSRS owner isolation |
| Admin control plane | Admin -> Admin API -> owner API/DB                                         | 七角色和组合权限、re-auth、review/publish/activate/rollback、SupportGrant、Audit/Deployment read-only         |
| Agent conversation  | Web -> Agent API -> Job -> Agent Executor -> Gateway -> fake Provider      | SSE reconnect、exactly-once permit、plan/tool/wait/proposal/artifact、cancel/preempt、usage ledger            |
| Asset lifecycle     | Web -> Agent API -> MinIO quarantine -> Asset Processor -> ClamAV -> clean | hash/size/type、恶意文件拒绝、revision pinning、删除 CAS、未 READY 不可用                                     |
| Evaluation          | Admin/Job -> Agent Evaluator -> Gateway fake -> Agent API                  | immutable evidence、Evaluator 无 production Session 读取和 activation 权限                                    |
| Lexicon lifecycle   | Admin -> Builder -> artifact -> Publisher -> staging -> Admin activation   | 200 词 deterministic build、校验、幂等 publish、Publisher 不激活、rollback                                    |
| Automation          | Admin/API -> Job -> Automation Executor                                    | export/source sync/retention progress、checkpoint、fencing、restart/UNKNOWN_OUTCOME                           |
| Resilience          | browser/API + service restart                                              | Redis loss polling、SSE Last-Event-ID、worker lease takeover、无重复 side effect                              |

这些 journey 不直接写业务表来跳过入口；只有 database-install/seed fixture 可持有测试数据库管理权限。权限拒绝必须同时在 API 层和数据库角色层验证，前端 route guard 不能替代后端 deny evidence。

## 7. 重试、trace 与报告

本地 `retries: 0`；CI `retries: 1`、`trace: "on-first-retry"`、`screenshot: "only-on-failure"`、video 默认关闭。CI 同时设置 `forbidOnly: true` 和 `failOnFlakyTests: true`，因此 retry 用于采集第二次执行证据，不会把 flaky 当作 green。Playwright [retries 文档](https://playwright.dev/docs/test-retries)会区分 passed/flaky/failed，[CLI/config](https://playwright.dev/docs/test-cli)提供 `--fail-on-flaky-tests`，[trace 指南](https://playwright.dev/docs/trace-viewer-intro)建议 CI 在第一次 retry 记录 trace，而不是为所有成功测试承担开销。

CI 初始使用 4 个 shard，`fullyParallel: true`，每 shard `workers: 1`，`strategy.fail-fast: false`，实际时长数据证明失衡后再调整 shard 数。Playwright [CI 指南](https://playwright.dev/docs/ci)建议 CI 使用一个 worker 保证稳定性，把更宽的并行交给 sharding；fully-parallel 仍让 Playwright 以单个 test 平衡 shard。其[官方 sharding 指南](https://playwright.dev/docs/test-sharding)给出了 GitHub Actions matrix、blob upload、`merge-reports` 和最终 HTML artifact 的完整模式。`system:exclusive` 单独一个非分片 job，避免全局写操作和普通 journey 竞争。

每个 shard 无论成功失败都上传 blob report；merge job 使用 `if: $&#123;&#123; !cancelled() &#125;&#125;` 和 `needs` 合并为 HTML/JUnit。stack controller 在 teardown 前捕获 `compose ps`、全服务日志和自身状态，并使用本次运行生成的 secret 集合精确脱敏；只有失败 job 上传 diagnostics、trace 和截图。GitHub 的 matrix 可从一份 job 定义产生多个独立 job，并由 `fail-fast` 控制是否取消其他组合，[workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)是该行为的权威定义。GitHub artifacts 可以在 job 间传递测试输出并设置独立 retention，[官方 artifact 文档](https://docs.github.com/en/actions/tutorials/store-and-share-data)支持这一用法。

保留策略：失败/flake 的合并 HTML、trace、截图和经过 redaction 的服务日志保留 14 天；成功报告保留 3 天；shard blob 合并后保留 1 天。禁止上传数据库 volume、MinIO 原始对象、auth storage、`.env`、credential envelope 或完整模型 exchange。

## 8. Turbo 与 CI 边界

`e2e` 是一个 non-cacheable Turbo root task：`//#e2e` 显式依赖十二个 app 的 build/image preparation task，但不声明可恢复的业务 output，Compose、database install、数据库写入、模型调用和 browser execution 都设置 `cache: false`。根 `e2e` script 只运行 stack controller/Playwright，不能再次调用 Turbo 形成递归；Turborepo 的[根任务说明](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks#registering-root-tasks)定义了 `//#task` 用法。只有确定性的 app/package build、类型检查和静态测试使用 Turbo cache。Turborepo 假定 cacheable task 是确定性的，并只恢复配置在 `outputs` 中的文件；[官方 caching 文档](https://turborepo.dev/docs/crafting-your-repository/caching)不支持把有外部状态的 E2E 当作可缓存计算。

本地无参数 `pnpm e2e` 等价于 `pnpm e2e:full`。根 runner 按 `core`、`api`、`system`、`browser-quality` 顺序执行四个相互隔离的 Playwright invocation；每个 suite 使用独立 run id、端口段、数据库、volume 和 Bucket，并各自完成 teardown。`pnpm e2e:core` 运行 Chromium Web/Admin/Agent journey，`pnpm e2e:api` 运行可分片 API system，`pnpm e2e:system` 顺序运行 API system 与 `system:exclusive`，`pnpm e2e:browser-quality` 运行 mobile、accessibility 和 Firefox/WebKit smoke。显式 `--project` 只允许同一 suite 的 projects，跨 suite 组合会 fail closed。全局 release mutation、服务 restart 和普通学习流程因此不会共享 stack 或并发竞争。

PR 流程先让 Turbo 运行 affected lint/typecheck/unit/build，再运行完整 Chromium E2E、axe WCAG A/AA 和 Firefox/WebKit shell smoke required check；protected `main` 仍运行全 workspace 及同一完整矩阵，不能因 affected 结果跳过。Nightly 从 GHCR 拉取 `main` 精确 SHA 的十二个已验证镜像，执行 Firefox/WebKit 完整 User/Admin/Agent 回归、Chromium accessibility 回归和 focused mutation，不重新构建另一套产物。Turborepo 的 [CI 指南](https://turborepo.dev/docs/crafting-your-repository/constructing-ci)支持 task graph、cache、`--filter`/`--affected`，并说明 Git history filtering 需要非 shallow history。E2E 消费同一 workflow 已构建的十二个 image digest，不在每个 shard 重建十二次；matrix job 下载经过验证的 image manifest，再启动自己的隔离 stack。

GitHub service containers 适合 PostgreSQL/Redis 这类简单单-job dependency，且每个 job 都会获得并销毁自己的 service container；但 Sylis 还需要 MinIO、ClamAV、十二个 app、database-install one-shot 和本地一致性，因此以 Compose/Testcontainers 为唯一系统拓扑，避免同时维护 `services:` 与 Compose 两套配置。[GitHub 官方 service container 文档](https://docs.github.com/en/actions/use-cases-and-examples/using-containerized-services/about-service-containers)也限定 service container 只属于单个 Linux job。

## 9. Secret hygiene

普通 PR/main E2E 必须做到零外部 secret：

- fake Provider 不接受真实 DeepSeek/OpenAI/Anthropic/Gemini key，外网 provider egress 默认拒绝；
- service grant、session signing、content KEK、MinIO credential 均在 shard 内随机生成，只活到 teardown；
- BYOK 场景使用显式无价值 fixture，并断言任何 provider fallback 都失败；
- Railway token、production database URL、production KEK、真实 provider key 和 User 数据不进入 E2E job；
- workflow 使用最小 `permissions`，fork PR 不获得 deployment environment 或 secrets；
- secret 只通过环境变量或 stdin 注入，不放在命令参数、Turbo hash、report name 或日志中；非 GitHub secret 的敏感动态值立即 `::add-mask::`；
- trace、HAR、request/response attachment 和服务日志只允许 synthetic fixture，并执行 header/body redaction。

GitHub 官方说明 fork/Dependabot 事件不会获得普通 secrets，OIDC 可避免长期云凭据，并警告不要通过进程命令行传 secret；动态敏感值需要显式 mask，见[使用 Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)。Playwright 也明确指出 storage state 可能包含可冒充账号的 cookie/header，不能提交仓库，见[认证文档](https://playwright.dev/docs/auth)。

## 10. 完成标准

最终验收只有在以下事实同时成立时通过：

1. 空环境可一条命令启动基础设施、安装数据库、seed、十二个 app 并运行全部 projects；
2. Web、Admin、Agent、Asset、Evaluation、Lexicon、Automation 和 resilience journey 全部通过；
3. 同一 suite 可并行、可分片、可单测重跑，不依赖执行顺序或共享可变身份；
4. 一次 retry 后通过仍因 `failOnFlakyTests` 使 required check 失败；
5. merge job 在 shard 失败时仍产出可打开的 HTML/trace，且 artifact 不含 auth/secret/User 数据；
6. teardown 在成功、失败和取消路径都移除 project/volume/network；
7. 普通 E2E 无 Railway/production/provider secret、无付费模型调用、无公网写入；
8. 最终完整矩阵在实现全部完成后执行，任何修复后重跑受影响诊断，并在交付前再次完整执行。
