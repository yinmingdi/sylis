# 当前代码到目标结构的重构映射

> 本文是删除/替换清单，不表示当前代码已经完成这些调整。没有生产 User，所有结构调整都是一次性替换，不建立兼容层。

## 1. 顶层目录

| 当前/中间结构                    | 最终结构                                                                         | 处理                                            |
| -------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| `apps/web`                       | `apps/frontends/web`                                                             | 路由与 module 重构后移动                        |
| `apps/admin` 或 `apps/admin-web` | `apps/frontends/admin`                                                           | 只保留一个独立 Admin app                        |
| `apps/api` 或 `apps/user-api`    | `apps/backends/api`                                                              | Identity + User/Learning/Reading owner modules  |
| 混在 API 的 Admin routes         | `apps/backends/admin-api`                                                        | 独立 audience、RBAC、re-auth 和 deploy          |
| `ai-tutor`/chat module           | `apps/backends/agent-api`                                                        | 替换为 AgentSession/Run/Event/Artifact/Proposal |
| AI provider adapter/credential   | `apps/backends/model-gateway`                                                    | 唯一模型调用、密钥、route、usage owner          |
| generic `worker`                 | `agent-executor` + `agent-evaluator` + `asset-processor` + `automation-executor` | 按执行职责拆分，不保留 generic 名称             |
| compiler runner                  | `apps/backends/lexicon-builder`                                                  | 只装配 compiler/source/model/storage/Job        |
| importer runner/service          | `apps/backends/lexicon-publisher`                                                | 只校验/导入 release，不解析来源或调用 AI        |
| `services/**`                    | 删除                                                                             | 所有部署产物已在 `apps/**`                      |

## 2. Package 映射

| 当前/中间 package                      | 最终 owner                                               |
| -------------------------------------- | -------------------------------------------------------- |
| lexicon contracts/schema               | `@sylis/lexicon-artifact`                                |
| lexicon source/merge/enrichment/writer | `@sylis/lexicon-compiler`                                |
| user/admin/agent generated clients     | `@sylis/api-client` subpaths                             |
| AI provider ports/adapters             | 删除共享 package；实现只在 `apps/backends/model-gateway` |
| AI Tutor loop/prompt/tool policy       | `@sylis/agent-runtime`                                   |
| Agent DTO/event/tool schemas           | `@sylis/agent-contracts`                                 |
| background job contracts               | `@sylis/job-contracts`                                   |
| claim/lease/heartbeat runtime          | `@sylis/job-runtime`                                     |
| field encryption helpers               | `@sylis/content-crypto`                                  |
| Prisma schema + SQL-only invariants    | `@sylis/database`                                        |
| UI primitives                          | `@sylis/components`                                      |
| cross-runtime pure helpers             | `@sylis/utils`                                           |
| product engineering harness package    | `tools/engineering-harness`                              |
| `shared/common/core`                   | 删除并迁到明确 owner                                     |

## 3. 领域模型替换

| 旧模型                      | 最终模型                                                                      |
| --------------------------- | ----------------------------------------------------------------------------- |
| `Word/Meaning`              | Headword -> LexicalEntry -> Form/Sense -> Concept                             |
| JSON 中的词义/例句/关系     | release-scoped typed tables + provenance                                      |
| `Card/Question/Quiz`        | Objective -> ExerciseRevision -> Attempt；task/evidence/response/grading 分离 |
| `UserWord` counters         | MemoryState + append-only ReviewEvent/Attempt                                 |
| mutable `Article`           | ReadingDocument/Revision + origin/annotation/activity                         |
| `Chat/TutorSession`         | AgentSession/Message/Run/RunStep/Event/ToolCall/Artifact/Proposal/Memory      |
| `BackgroundJob` with PAUSED | Job + fenced JobAttempt；WAITING 属于领域 Run                                 |
| AI 直接保存结果             | complete Step proposal -> Agent API preflight/关系 truth -> authorized plan   |
| 在线缺词补写                | private Artifact + dedup LexiconGapReport -> next compiler release            |

## 4. 前端替换

- 删除独立 Tutor、Grammar 和 AI Reading route/store/client；新增 `/agent` 与 `/agent/sessions/:id`。
- 页面使用 `app/pages/modules/components/utils/assets` 语义；领域组件留在 module，跨应用 primitives 才进入 package。
- TanStack Query 作为 server-state cache；删除复制 server entity 的全局 store 和 offline answer truth。
- Exercise 使用 `CHOICE/SHORT_TEXT/EXTENDED_TEXT/NO_CAPTURE` renderer，不用 `Card` 命名题型。
- Admin 拥有独立 bundle、router、QueryClient、cookie/audience 和 Railway service。

## 5. 后端替换

- Controller 只处理 transport/auth/DTO，业务用例和 repository 留在 owner module。
- API、Admin API、Agent API 之间只走生成 client/typed internal interface，不 deep import app 源码。
- Agent Executor 只写 Job/Attempt runtime 数据并向 Agent API 提交语义 command，数据库 role 禁止领域写入。
- Model Gateway 独占 Provider SDK/credential/permit/invocation/exchange；Evaluator 与 production Session 隔离；Asset Processor 强制 quarantine 门禁。
- Automation Executor 只处理 export/sync/purge；Builder 只生成 Artifact；Publisher 只创建未激活 release。
- 所有 app 配置在 composition root 校验；provider key 不进入 API 或 frontend。

## 6. 工具与命令清理

- pnpm + Turbo 保留；Nx、tsup、tsdown 和多余 monorepo metadata 删除。
- 所有 `phase1-*`/`phase2-*` 命令改为职责名，例如 `lexicon:build:pilot`、`lexicon:validate`、`db:install`、`ci:full`。
- TypeScript local/workspace import 删除 `.js`/`.ts` 后缀。
- Railway Git source autodeploy、develop/release branch workflow 和旧 service config 删除。
- Docker context 排除 `.work`、`img/`、`img.zip`、source dump、local env 和测试产物。

## 7. 删除证明

最终架构检查必须证明：

1. workspace 只有十二个 app 和 12 个 package；
2. 没有 `services/` 或 app-to-app source import；
3. 没有旧 table/module/route/command 的运行时引用；
4. frontend bundle 无 server-only code；
5. fake providers 可运行全部普通测试；
6. Prisma 空库安装 + fixed Artifact 可完成 release build、activation 和 rollback；
7. 十二个 Docker image 均能独立启动、ready 和优雅关闭。
