# Sylis 端到端测试最佳实践与落地方案

> 研究日期：2026-08-10。本文只引用官方文档、规范和一手项目资料，并以当前仓库实现为审计基线。

## 1. 结论

Sylis 不应该追求“每个功能都写成浏览器 E2E”，也不应该把所有经由 `page.request` 发出的 API 请求都称为浏览器端到端测试。正确目标是：

1. 每个主要用户能力至少有一条从真实 UI 入口完成、以用户可见结果收尾的 Chromium 关键旅程。
2. 参数组合、错误码、权限矩阵、幂等、并发与持久化由 API system、contract、integration、property 和 unit 测试覆盖。
3. 自有服务之间保留真实网络、队列、数据库和对象存储边界；只有不可控的外部 Provider 在常规 CI 中使用契约受控的 fake。
4. Agent 的确定性编排 E2E 与非确定性模型质量 eval 分开，二者不能互相替代。
5. 覆盖率必须证明某条测试在指定 CI lane 中被收集、执行并通过，不能只证明源码里出现了一个 test ID。

测试形状采用风险驱动的“分层组合”，而不是机械追求某个比例。Martin Fowler 的测试金字塔资料强调多粒度测试、高层测试更少，以及把重复验证尽量下移；其后续测试形状讨论也明确指出 trophy/honeycomb/pyramid 是不同系统的启发式，而不是统一配额。[Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)、[On the Diverse And Fantastical Shapes of Testing](https://martinfowler.com/articles/2021-test-shapes.html)

## 2. 当前 Sylis 的事实与差距

### 2.1 已经正确的基础

当前[测试拓扑](./monorepo-e2e-topology.md)和实现已经具备可靠基础：

- 十二个应用使用实际构建镜像，PostgreSQL、Redis、MinIO、ClamAV 和 fake Provider 运行在隔离 Compose stack 中。
- Playwright project dependencies 负责空库安装、seed 和 teardown；`system:exclusive` 单 worker 运行全局写入和故障注入。
- 每个 shard 有独立 Compose project、数据库和存储 namespace；CI 以四个普通 shard 加独立 system job 执行。
- CI 开启 `failOnFlakyTests`、一次诊断 retry、首个 retry trace，并合并 blob report。
- PR/main 使用真实 Model Gateway 加确定性 fake Provider，没有把自有 Gateway mock 掉。
- accessibility 与 Firefox/WebKit shell smoke 已进入 CI，Firefox/WebKit 全回归进入 nightly。

这些选择符合 Playwright 对 project dependencies、隔离、CI 单 worker 加 sharding 和 trace 的建议，也符合 Docker 对 `service_healthy`/`service_completed_successfully` 的 ready 语义。[Playwright projects](https://playwright.dev/docs/test-projects)、[Playwright CI](https://playwright.dev/docs/ci)、[Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/)

### 2.2 不能据此宣称“所有主要功能已有完整 E2E”

当前用例有以下实质差距：

| 范围       | 当前证据                                                                    | 缺口                                                                                                                             |
| ---------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 词典       | `LEXICON-001-E2E` 全程通过 `page.request` 检查结构                          | 没有从搜索页进入单词详情并验证词性分组、sense、词形、例句、关系和搭配的 UI 旅程                                                  |
| 词书/学习  | 选书、入书、首个评分复习主要通过 API；四种 response renderer 经 UI 操作     | 没有用户从书单选书、设置计划、开始学习、提交并看到进度/统计的完整 UI 主路径                                                      |
| Notebook   | 创建、修改、删除全由 API 完成                                               | 没有 Notebook 页面 CRUD，也没有证明 Agent 提案提交后在 Notebook UI 可见                                                          |
| 账户       | 注册、二次登录和退出有 UI；profile、consent、session 管理多为 API           | 密码恢复、账户删除、BYOK 添加/校验/轮换以及 session 撤销的用户 UI 主路径未闭合                                                   |
| Agent      | 普通新建会话和发送消息有 UI；取消、等待、tool、proposal 多为 API/SSE client | 没有通过聊天 UI 展现工具过程、等待输入、取消、批准/拒绝提案、artifact 最终结果的完整主路径；只有 `lexicon.search` 工具被完整跑通 |
| Asset      | 文本与 EICAR 通过 API 上传并验证后端流水线                                  | 没有 UI 上传/状态/删除；没有 PDF、图片、OCR/vision/embedding 支持范围的代表 fixture                                              |
| Admin      | 登录有 UI；角色矩阵、凭据、预算、评估、Job、release 多为 API                | 控制面核心操作没有代表性的 UI 旅程；SupportGrant 的创建、使用、过期和撤销缺失                                                    |
| 数据治理   | export、audit、legal hold 有 system 测试                                    | retention purge、账户删除及其不可逆边界未完整覆盖                                                                                |
| 词典流水线 | 小型确定性 artifact 的发布/激活/回滚已覆盖                                  | ECDICT/Kaikki/OEWN/有道/AI 到标准 artifact 的代表性多源编译链未形成一条受控验收；完整语料不应放进 PR E2E                         |
| Provider   | fake route 验证编排和故障场景                                               | 没有受保护环境中的真实 DeepSeek transport/tool/JSON smoke，也没有独立模型质量 eval                                               |
| 部署后     | Web/Admin 登录 shell 与静态资源检查                                         | 没有已登录、只读的词典/学习/Agent readiness synthetic，也未核对十二个服务版本是否对应同一 SHA                                    |

另外有两个治理漏洞：

- 根命令 `pnpm e2e` 默认只运行 Web desktop/mobile、Admin desktop、Agent desktop 和 system；不会运行 accessibility、Firefox 或 WebKit。CI 虽另有 job 补上，但“本地完整 E2E”与“CI 完整 E2E”的名称和证据并不一致。
- `packages/test-support/src/coverage-manifest.ts` 的 `validateCoverageEvidence` 只检查 evidence 文件存在且源码包含 test ID。它不证明 Playwright project 收集了该测试、不证明声明的 CI lane 执行了它，也不证明行为断言与 requirement 相符。

Playwright 官方把 `APIRequestContext` 的用途明确区分为测试 API、准备浏览器前置状态、验证浏览器动作的服务端后置状态。因此 API request 可以属于广义 system E2E，但不能替代“用户能否从页面完成工作”的浏览器证据。[Playwright API testing](https://playwright.dev/docs/api-testing)

## 3. 目标测试分层

| 层                   | 主要目录                           | 责任                                                         | 不负责                   |
| -------------------- | ---------------------------------- | ------------------------------------------------------------ | ------------------------ |
| Static/type          | 各 workspace                       | enum 穷尽、schema/type、架构约束、secret scan                | 运行时行为               |
| Unit/property        | app/package 邻近测试               | 纯规则、FSRS/评分、状态机、lexicon 归并不变量、生成矩阵      | 网络/持久化接线          |
| Component            | frontend module 邻近测试           | renderer 状态、表单错误、键盘与可访问语义；后端可 stub       | 完整部署拓扑             |
| Contract             | consumer/provider 契约             | OpenAPI、event、job、artifact、Provider adapter 的序列化兼容 | 用户旅程                 |
| Integration          | app/package integration            | 单服务连真实 PostgreSQL/Redis/MinIO/队列的边界和数据库权限   | 十二服务全拓扑           |
| API system           | `tests/e2e/specs/api`、`system`    | 真实服务栈上的权限矩阵、并发、幂等、故障恢复和后台 Job       | 浏览器可用性             |
| Browser journey      | `tests/e2e/specs/browser`          | 用户从页面入口完成核心工作并看到结果                         | 穷举所有参数和错误码     |
| AI eval/security     | `tests/ai-evals`、`tests/security` | 非确定性质量、工具选择、grounding、安全与 adversarial 集     | 页面接线                 |
| Deployment synthetic | `tests/deployment`                 | staging/production 黑盒可用性、版本、关键只读路径            | 完整回归或破坏性管理操作 |

不要求立即移动所有文件，但 test ID、manifest `layer` 和报告必须先按此语义分类。纯 API 的 `*-E2E` 应改为 `*-SYSTEM`；只有 UI 主动作和 UI 结果都存在时才标记 `*-BROWSER-E2E`。

## 4. UI 与 API 测试的职责

浏览器 journey 遵循以下硬规则：

- 核心业务动作必须经 UI 完成。例如“加入词书”的测试必须点击书籍和加入按钮，不能用 `page.request.post` 代替。
- `page.request` 只用于创建不属于本 journey 的前置数据，或验证 UI 动作完成后的服务端后置状态。
- 一个测试只能有一个清晰的用户目标；断言页面可见结果、URL、可访问状态以及必要的最终持久化，不断言 React 内部结构。
- locator 优先 `getByRole`、`getByLabel` 和可访问名称；`data-testid` 仅用于没有用户语义的稳定技术锚点。Testing Library 的指导原则同样要求测试尽量接近用户使用方式。[Testing Library guiding principles](https://testing-library.com/docs/)、[query priority](https://testing-library.com/docs/queries/about/)
- 使用 Playwright auto-wait、locator/web-first assertion 和 `expect.poll` 等待可观察状态；禁止固定 sleep。[Playwright best practices](https://playwright.dev/docs/best-practices)
- `page.route` mock 自有 API 的用例只能归为 frontend integration/component，不得作为全栈 E2E 证据。

API/system 测试负责：每个 OpenAPI operation 的认证、对象级授权、角色组合、边界值、无效输入、错误码、幂等 key、乐观锁、并发、分页、数据隔离和后台状态转换。OWASP ASVS 提供了可版本化引用的 Web/API 安全验证要求，WSTG 则覆盖身份、认证、授权、会话、输入、业务逻辑和 API 测试；安全 manifest 应引用固定版本而不是笼统写“已测安全”。[OWASP ASVS 5.0](https://github.com/OWASP/ASVS/tree/v5.0.0_release)、[OWASP WSTG](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/)

## 5. 必测主要用户旅程

每个 journey 都需要一个 owner、risk、稳定 test ID、预期 lane 和明确的 UI/API 两类证据。下表是“主要功能已覆盖”声明的最低矩阵。

| Journey                | 浏览器必须完成的动作与可见结果                                                 | 下层补充证据                                                      | PR/main                             |
| ---------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------- |
| `J-IDENTITY-REGISTER`  | 注册、验证码、首次进入学习页                                                   | challenge 过期/重放、限流、枚举攻击                               | 必跑                                |
| `J-IDENTITY-RECOVER`   | 忘记密码、重置、旧 session 失效、新密码登录                                    | token 单次使用、过期、账户隔离                                    | 必跑                                |
| `J-IDENTITY-SECURITY`  | 修改 profile/consent、查看并撤销另一 session、退出                             | CSRF、重新认证、跨用户拒绝                                        | 必跑                                |
| `J-IDENTITY-BYOK`      | 添加 DeepSeek key、看到 masked 状态、轮换/撤销                                 | envelope 加密、明文不返回、错误 key、route 权限                   | main；PR 用无价值 fake key          |
| `J-LEXICON-DISCOVER`   | 搜索 `bank`，打开详情，逐 sense 查看词性、释义、翻译、例句、词形、关系、搭配   | headword/sense API schema、release pin、lemma/form 查询矩阵       | 必跑                                |
| `J-STUDY-CORE`         | 浏览 200 词书、加入、设置每日量、开始、答题、评分、查看进度                    | 四 response kind 组合、评分/FSRS property、幂等与 owner isolation | 必跑                                |
| `J-NOTEBOOK-LIFECYCLE` | 新建 Notebook、从词条加入、编辑、筛选、删除                                    | revision/CAS、typed target、跨用户拒绝                            | 必跑                                |
| `J-AGENT-CHAT`         | 新建会话、发送、看到 streaming、刷新恢复、取消、等待并继续                     | SSE Last-Event-ID、重复 instruction、timeout/429/abort            | 必跑                                |
| `J-AGENT-BLOCKS`       | 看到 heading/list/code/table/citation、三个工具状态、Proposal/Wait 与 Artifact | Block tree/typed ref、fragment resume、focus/a11y、exact revision | 必跑 desktop/mobile；兼容性 main    |
| `J-AGENT-TOOLS`        | UI 显示代表性的 lexicon、learning、notebook、reading/web tool 调用及来源       | 每个 tool 的 allow/deny、schema 错误、timeout、user scope         | 必跑代表路径；完整矩阵 main/nightly |
| `J-AGENT-PROPOSAL`     | 聊天中看到写入提案，拒绝一次、批准一次，Notebook UI 出现结果                   | action digest、重复审批、过期、服务端重新授权                     | 必跑                                |
| `J-AGENT-ARTIFACT`     | 生成文章/语法分析，查看 revision，并把它再次作为上下文                         | JSON schema、revision pin、escaping、删除                         | main                                |
| `J-ASSET-LIFECYCLE`    | 上传、处理状态、选为上下文、删除；覆盖 txt/PDF/image 代表件                    | hash/MIME/size、ClamAV、OCR/vision/embedding、恶意内容            | txt 必跑；PDF/image main/nightly    |
| `J-ADMIN-AUTHZ`        | MFA 登录；每类角色看到允许导航，越权入口不可用                                 | 每个 Admin operation 后端 allow/deny、DB role deny                | 必跑                                |
| `J-ADMIN-OPERATE`      | 代表性执行凭据轮换、预算修改、Job 取消/重试、Agent evaluation                  | reauth、CAS、audit、预算并发                                      | main                                |
| `J-SUPPORT-GRANT`      | 用户创建/确认 grant，Admin 使用，用户撤销后立即失效                            | purpose/resource/revision scope、过期、audit                      | main                                |
| `J-DATA-GOVERNANCE`    | 用户请求 export/删除并看到状态；Admin 查看脱敏审计                             | retention/legal hold、不可逆边界、下载授权                        | main；purge nightly                 |
| `J-LEXICON-RELEASE`    | Admin 查看 candidate、发布/激活并回滚                                          | 多源小 fixture 编译、artifact 校验、幂等 publish、版本 pin        | main，system exclusive              |
| `J-RESILIENCE`         | 用户在短暂依赖故障时看到可恢复状态而非重复副作用                               | Redis/MinIO/DB/ClamAV/Provider/worker 故障注入与 fencing          | main，system exclusive              |

完整 76 万行或完整词库编译属于 scheduled data pipeline acceptance，不属于每个 PR 的浏览器 E2E。PR 使用包含同形异义、屈折变化、多词性、关系、搭配、缺失字段和冲突来源的小型代表 fixture；nightly/release 再运行完整源数据质量、唯一性、引用完整性和 artifact digest 检查。

## 6. Agent 与真实 Provider

### 6.1 常规 CI：确定性 fake，但真实执行链

PR/main 必须继续使用：

```text
Browser/API -> Agent API -> Job -> Agent Executor -> Model Gateway
            -> deterministic Provider adapter -> Tool/Proposal -> persistence
```

fake Provider 需要成为可执行契约：支持正常 stream、同一步 mixed text/reasoning/tool、按 index 交错的多个 tool call、structured JSON、等待、429、5xx、timeout、截断、非法 frame、重复 frame、headers-sent failure 和取消，并由同一 adapter contract suite 验证 fake 与真实 adapter 的解析规则。它能证明编排、权限和持久化，不能证明模型回答质量。

Agent deterministic matrix 还必须覆盖：parallel-safe rolling pool、exclusive barrier、超过 worker concurrency 只排队、相同参数双调用不去重、一个调用失败而 sibling 成功、取消时 started/unstarted/unknown outcome 分离、按 modelPosition 提交 receipt、Provider 仅在没有 accepted normalized block/visible fragment/tool call/usage 前 retry 且只新增 Attempt、Executor restart 不重放已终态工具、浏览器只重连 Session SSE、v1 本地资源请求受控拒绝，以及 structured generation 继续只接受一个 strict-result 调用。Block contract 另覆盖 closed kind、typed child/reference、tree/depth/position、`modelPosition + modelSubPosition`、versioned parser、fragment 四元键幂等、sealed immutability、unknown schema 和 Artifact revision pinning。

每个 tool 至少覆盖：成功、参数 schema 拒绝、认证/owner 拒绝、上游 timeout、重复提交；side-effect tool 还必须覆盖 preview/digest、用户批准/拒绝/过期、提交时重新鉴权和 exactly-once。OWASP 将过多功能、权限和自主性定义为 Excessive Agency，并要求最小工具集、用户上下文、后端 complete mediation 及高影响动作人工批准。[OWASP LLM06 Excessive Agency](https://owasp.org/www-project-top-10-for-large-language-model-applications/2_0_vulns/LLM06_ExcessiveAgency.html)

所有模型输出在进入 HTML、数据库、文件路径或工具之前执行 schema validation 和上下文编码；测试直接/间接 prompt injection、恶意网页/文件内容、越权 tool call、secret/PII 外泄和持久化内容再次注入。OWASP 明确要求把模型输出视为不可信输入。[OWASP LLM05 Improper Output Handling](https://owasp.org/www-project-top-10-for-large-language-model-applications/2_0_vulns/LLM05_ImproperOutputHandling)

### 6.2 受保护 lane：真实 DeepSeek smoke 与质量 eval 分开

真实 Provider 分两类证据：

- `provider-contract-smoke`：固定低成本 prompt，验证认证、模型 ID、non-stream/stream、tool call、JSON parse、usage 和超时边界。只断言协议/结构，不断言逐字输出。DeepSeek 官方说明其 API base URL、stream 能力以及 JSON Output/tool call 能力；JSON 模式仍可能返回空内容，因此必须覆盖空内容处理。[DeepSeek API](https://api-docs.deepseek.com/)、[DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)
- `agent-quality-eval`：版本化 dataset，覆盖典型、边界和 adversarial 学习任务，记录 prompt/capability/tool/eval release、provider/model、成功率、grounding、结构正确率、安全违规、延迟、token 和成本；以 rubric、分类或 pairwise 为主，并定期用人工标注校准 scorer。

模型输出具有非确定性，传统 exact assertion 不足。NIST 要求 AI 在部署前及运行中持续进行可重复、可记录的 TEVV；OpenAI 的官方 eval 指南也建议 task-specific dataset、明确指标、持续评估和人工校准。[NIST AI RMF Core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)、[Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)

真实调用不进入普通 PR，不在开发者机器自动触发。它只在 protected GitHub environment 的手动 release 或预算受限的 nightly lane 中运行；失败分为 transport regression 与 quality regression，不能靠无限 retry 变绿。

## 7. 真实边界、数据与 Secret 隔离

自有服务 E2E 不 mock：API、Admin API、Agent API、executors、evaluator、Gateway、lexicon builder/publisher，以及 PostgreSQL、Redis、MinIO、ClamAV 都运行真实 artifact。第三方网络只在显式 provider smoke 中开放。Testcontainers/Compose 可为每次运行创建隔离环境并按 healthcheck 等待；Compose 自身只保证 started，不能替代 readiness。[Testcontainers Compose](https://node.testcontainers.org/features/compose/)、[Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/)

隔离层级固定为：

- run/shard：独立 Compose project、database、Redis namespace、MinIO bucket prefix、fake ledger 和动态端口；
- worker：独立 User、Operator、storage state、grant 和 Agent session root；
- test：从 `runId + shard + parallelIndex + testId` 派生 email、record ID、idempotency key、asset key 和 artifact；
- shared seed：只允许不可变 reference/release fixture；可变用户数据由 fixture 创建，测试不得依赖前一个测试。

浏览器 context 的隔离不会自动隔离数据库和队列；Playwright 官方因此建议为 test/worker 派生独立后端数据和账号。[Playwright parallel isolation](https://playwright.dev/docs/test-parallel)、[Playwright authentication](https://playwright.dev/docs/auth)

普通 E2E 零外部 secret。shard 内 signing key、service grant、MinIO credential 和测试 KEK 动态生成并随 stack 销毁。真实 DeepSeek key 只存在于 protected environment，最小权限、预算上限、可轮换，不进入参数、cache key、trace、HAR、HTML、日志或 artifact；storage state 也不得提交或上传。GitHub environment 可在保护规则通过前阻止 job 获取 environment secret，OIDC 可在支持的平台替代长期云凭据。[GitHub environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)、[GitHub OIDC](https://docs.github.com/en/actions/reference/security/oidc)、[OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

## 8. 浏览器、移动端与可访问性

| Lane         | 浏览器范围                                                                                                               | 目的                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| PR           | Chromium desktop 全部关键 UI journey；Chromium mobile 关键登录/学习/Agent；Firefox/WebKit shell + 一条登录后核心 journey | 快速阻断产品主路径和明显兼容问题 |
| main/release | Chromium 全矩阵；Firefox/WebKit 关键 UI journey；axe 关键状态                                                            | 发布前兼容与无障碍门禁           |
| nightly      | Firefox/WebKit 全部真实 UI journey、多个 mobile profile、视觉回归候选                                                    | 较慢回归与兼容发现               |

“Firefox/WebKit full”必须选择真正操作 UI 的 browser-tagged specs；复制执行 API-heavy spec 不会增加浏览器兼容信心。Playwright projects 适合表达浏览器、设备和环境配置。[Playwright projects](https://playwright.dev/docs/test-projects)

axe 扫描覆盖 public/authenticated 页面，以及打开 modal、validation error、streaming、waiting、proposal 和 upload 状态；另写键盘顺序、focus restore、可访问名称和 live region 的行为断言。自动扫描不能宣称 WCAG 合规，W3C 与 Playwright 均要求结合人工检查和用户评估。[Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)、[W3C evaluating accessibility](https://www.w3.org/WAI/test-evaluate/)

## 9. 韧性与可观测性

保留现有 Redis、MinIO、worker fencing、SSE resume 测试，并补齐：

- Provider 429/5xx/timeout/截断/非法 stream，验证 retry budget、错误可见性和无重复账单/副作用；
- Agent Executor 在 tool 前、tool 后、proposal commit 后崩溃，验证 lease takeover 和 exactly-once；
- ClamAV/OCR/embedding 不可用时 asset 不得错误进入 `READY`；
- PostgreSQL 连接中断与恢复、只读/权限错误，不得降级为越权写入；
- browser offline/reconnect、SSE 中断、刷新及多 tab session 撤销；
- streaming Block 中断时 snapshot + cursor 无重复/缺失 fragment，ToolCall/Artifact/Proposal stable Block identity 与键盘焦点不漂移；
- lexicon publish 中断、重复 publish、旧 revision activation 和 rollback。

等待只基于 readiness、领域状态或事件，不使用固定 sleep。诊断把 `runId/testId` 贯穿 HTTP、Job、tool、DB audit 与 service logs；默认只记录 provider/model、operation、status、latency、tokens 和 digest，不记录 prompt、output 或 tool 参数。OpenTelemetry 明确警告 GenAI input/output、system instructions、tool arguments/results 可能包含敏感信息。[OpenTelemetry GenAI attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)

## 10. CI lanes、分片与 flake 策略

### 10.1 推荐流水线

```text
PR
  static/type/unit/property/component/contract/integration (Turbo cache)
  -> build exact twelve images once
  -> Chromium browser/system shards + accessibility + browser smoke (no cache)
  -> merge report -> reconcile required evidence -> required check

main/release
  PR matrix
  -> Firefox/WebKit key journeys + security matrix + full artifact pilot
  -> immutable image publish -> Railway deploy -> post-deploy synthetic

nightly/manual protected
  full cross-browser + full source data quality + chaos/resilience
  + real DeepSeek provider smoke + Agent quality/security eval
```

Playwright 建议 CI 用单 worker 获得稳定性，把横向并行交给 sharding；`fullyParallel` 可按 test 粒度均衡 shard，blob report 可在最后合并。[Playwright CI](https://playwright.dev/docs/ci)、[Playwright sharding](https://playwright.dev/docs/test-sharding)

- 普通 suite 保持 4 shard、每 shard 1 worker；根据最近 20 次 p50/p95 时长再调整数量，而非持续增加本机 worker。
- `system:exclusive` 独立 stack、不可分片；production deployment 使用独立 concurrency group 串行，PR 可以取消旧 SHA。[GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- 十二个镜像只构建一次，shard 消费相同 immutable digest。Turbo 只缓存确定性任务；E2E、数据库写入、部署和真实 Provider 调用保持 `cache: false`。[Turborepo caching](https://turborepo.dev/docs/crafting-your-repository/caching)
- 每个 shard 无论成功失败都上传 blob；失败/flake 上传脱敏 trace、截图和服务日志。合并 HTML/JUnit/机器可读 execution manifest 后再判 required gate。[GitHub workflow artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data)

### 10.2 flake 不是 green

- 本地 `retries: 0`；CI `retries: 1` 仅为采集第二次证据，`failOnFlakyTests: true` 保持 required lane 失败。
- `trace: on-first-retry`、失败截图、video 默认关闭；Playwright 不建议为所有通过测试录制重型 trace。[Playwright trace guidance](https://playwright.dev/docs/best-practices)、[Playwright retries](https://playwright.dev/docs/test-retries)
- 禁止“重跑 workflow 直到绿”。flake 必须有 issue、owner、首次/末次 SHA、失败签名和到期日。
- quarantine 只能进入非 required lane，最长 7 天；critical journey 不允许 quarantine，只能修复或阻断发布。
- 每周报告每个 test 的 runs、first-pass rate、flake rate、p50/p95 和 failure signature。required tests 的目标是 first-pass 100%，而不是 retry 后通过。

## 11. 发布后 synthetic

当前 production smoke 只证明 Web/Admin shell 和静态资源可加载。目标 synthetic 分两层：

1. 每次部署阻断检查：十二个服务 `/ready`、公开 Web/Admin shell、version/SHA/image digest 一致、登录、词典搜索与详情、synthetic 用户的只读今日学习状态；不得改全局 release/route/policy。
2. 定时 synthetic：专用 synthetic 用户/tenant 完成一个可回收 Notebook 写入或受预算限制的 Agent 对话，立即清理并验证 audit；数据带稳定 synthetic tag，告警与真实用户指标分开。

staging 跑完整关键 journey；production 只跑小而可逆的黑盒路径。synthetic 失败必须关联部署 SHA、region、服务版本、trace ID 和用户可见错误，并阻止 GitHub release 发布或触发明确的回滚/人工处置。Google SRE 将黑盒结果、结构化日志/指标及可行动告警作为生产可靠性判断的一部分。[Google SRE monitoring](https://sre.google/workbook/monitoring/)

## 12. Coverage manifest 与真实执行证据闭环

`tests/coverage/requirements.json` 继续作为“计划覆盖”源，但不能单独作为验收结果。闭环包含四步：

1. **声明**：每个 requirement 增加 `owner`、`risk`、`requiredLayers`、`ciLanes`，每条 evidence 增加稳定 `testId`、runner、Playwright project/tag 和核心行为摘要。
2. **收集校验**：每个 lane 在执行前运行 Playwright `--list`/机器 reporter 和对应 test runner collect，生成 `planned-tests.json`；manifest 声称属于该 lane 的 ID 必须实际被该 lane 收集，禁止仅搜索源码字符串。
3. **执行证明**：blob/JUnit/JSON report 统一生成 `executed-tests.json`，记录 `commitSha`、lane、project、shard、browser、testId、attempt、status、duration 和 artifact link。
4. **对账门禁**：`coverage:reconcile --lane <lane>` 联结 requirement -> planned test -> executed result。缺失、未收集、unexpected skip、flake 或 failed 均失败；只有 manifest 明确允许且带原因/到期日的 skip 才可接受。

对账还要执行语义规则：

- `BROWSER_E2E` evidence 必须属于 browser project，且测试源码同时存在至少一个 UI action 和一个 web-first UI assertion；API setup/postcondition 可以存在，但不能是唯一动作。
- `SYSTEM` evidence 必须通过公开/内部受控 API 穿过真实服务，不允许直接 Prisma 写业务状态。
- critical requirement 至少两个独立层，其中至少一个是 browser 或 system；主要用户能力必须有 browser evidence。
- CI required job 必须依赖 report merge 和 reconcile，不得只依赖 shard job exit code。
- 生成的 coverage 文档展示 planned、collected、executed、passed 和 last verified SHA/date，不能只列文件路径。

由此，“所有主要功能已覆盖”的可验证定义是：journey 矩阵无空项；每个 critical journey 在目标浏览器/系统 lane 被实际收集并 first-pass；报告可回溯到同一 SHA 的镜像；没有过期 waiver 或未解释的 skip。

## 13. 实施优先级

### P0：先修正证据含义

1. 建立 browser/API/system/AI-eval 分类和稳定 test ID/tag，不急于移动文件。
2. 实现 `planned-tests.json`、`executed-tests.json` 和 `coverage:reconcile`，把 CI lane 与真实报告闭环。
3. 将纯 `page.request` evidence 从 Browser E2E 重分类为 System，保留现有有效测试。
4. 明确定义 `e2e:core`、`e2e:full`、`e2e:system`、`e2e:deployment`，使本地和 CI 名称不再误导。

### P1：闭合用户主路径

按价值顺序补 UI journey：词典详情 -> 选书/计划/学习 -> Notebook -> Agent tool/proposal/artifact -> Asset UI -> 账户安全/BYOK -> Admin 操作 -> SupportGrant/数据治理。API setup 复用 fixture，不在每条 UI journey 重复注册和底层组合。

### P2：补高风险系统矩阵

补全所有 Agent tool、对象级授权、密码恢复/删除/retention、PDF/image pipeline、Provider 故障、executor crash point、多源 lexicon 小 fixture 和安全 adversarial suite。

### P3：发布与持续质量

扩展 Railway synthetic；建立受保护的 DeepSeek contract smoke、Agent eval dataset/threshold、跨浏览器完整回归、full-corpus data acceptance、flake dashboard 和 waiver 到期治理。

## 14. 重构实施计划与验收账本

### 14.1 执行纪律

本次重构采用“先闭合全部实现，最后统一验证”的执行方式：

1. 工作包 W1-W7 期间完成测试架构、fixtures、测试代码、coverage tooling、CI workflow、文档，以及对应 journey 直接需要的前后端产品代码；禁止无关重构，也不运行测试、构建、typecheck、lint、format check、Playwright `--list` 或其他门禁。
2. 每完成一个工作包，立即在验收账本记录 acceptance ID、变更文件、预期证据和状态；不能依赖下一次会话重新回忆。
3. 状态沿用现有验收清单的 `TODO`、`IN_PROGRESS`、`IMPLEMENTED`、`ACCEPTED`。某工作包的全部源码写完、最终 diff 已人工审阅但尚未执行统一验证时记为 `IMPLEMENTED`；只有最终验证阶段对应命令全部通过并产生可追溯报告后才改为 `ACCEPTED`。
4. W1-W7 全部写完并审阅最终 diff 后，才能进入 W8。W8 是唯一允许运行测试和门禁的工作包。
5. W8 发现问题时，只修复对应实现，不借机重构无关代码；修复完成后重新执行受影响命令，最后再执行一次完整 W8 矩阵。

### 14.2 实施顺序

| 工作包            | Acceptance ID | 必须完成的实现                                                                                                                            | 状态                      |
| ----------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| W1 覆盖语义       | `E2E-01`      | 定义 `BROWSER_E2E`、`SYSTEM`、`AI_EVAL`、`SYNTHETIC`；为 requirement evidence 增加 runner/project/tag/behavior；重分类纯 API 用例         | 完成实现后：`IMPLEMENTED` |
| W1 执行对账       | `E2E-02`      | 实现 collect、execution manifest 与 `coverage:reconcile`；校验 requirement 在声明 lane 被实际收集和执行                                   | 完成实现后：`IMPLEMENTED` |
| W2 目录与 runner  | `E2E-03`      | 建立 browser/api/system/ai-eval/security/deployment 边界；提供 `e2e:core/full/system/browser-quality/deployment` 正式命令                 | 完成实现后：`IMPLEMENTED` |
| W2 基础 fixtures  | `E2E-04`      | 完成 run/shard/worker/test namespace、账号、Operator、storage state、API setup、fixture artifact、受控 clock/Provider 场景                | 完成实现后：`IMPLEMENTED` |
| W3 学习端 UI      | `E2E-05`      | 完成 identity、lexicon、book/study、Notebook 的关键 UI journeys，并补齐 journey 直接需要的产品代码；API 只作 setup/postcondition          | 完成实现后：`IMPLEMENTED` |
| W3 Agent/Asset UI | `E2E-06`      | 完成 chat、stream resume、wait/cancel、tool、proposal、artifact、txt/PDF/image upload 的关键 UI journeys，并补齐直接依赖                  | 完成实现后：`IMPLEMENTED` |
| W4 Admin UI       | `E2E-07`      | 完成 MFA/RBAC、credential/budget、Job、Agent release、SupportGrant、data governance 的代表 UI journeys，并补齐直接依赖                    | 完成实现后：`IMPLEMENTED` |
| W5 系统矩阵       | `E2E-08`      | 完成 authz、幂等、并发、retention/delete、tool 全矩阵、lexicon 多源 fixture、Job/DB/Redis/MinIO/ClamAV 故障注入，并补齐暴露的系统行为缺口 | 完成实现后：`IMPLEMENTED` |
| W5 AI 质量与安全  | `E2E-09`      | 完成 deterministic Provider contract、prompt injection/output handling、DeepSeek contract smoke 和版本化 Agent eval dataset/scorer        | 完成实现后：`IMPLEMENTED` |
| W6 浏览器质量     | `E2E-10`      | 完成 Chromium desktop/mobile、Firefox/WebKit browser-tagged journey、axe 状态扫描、键盘/focus/live-region 测试                            | 完成实现后：`IMPLEMENTED` |
| W7 CI 与报告      | `E2E-11`      | 完成 image-once、isolated shard、system exclusive、report merge/reconcile、flake/diagnostic、nightly/protected-provider workflows         | 完成实现后：`IMPLEMENTED` |
| W7 部署验收       | `E2E-12`      | 扩展 Railway version/SHA/readiness、authenticated read-only synthetic、可回收 scheduled synthetic 与部署 concurrency                      | 完成实现后：`IMPLEMENTED` |
| W8 统一验证       | `E2E-13`      | 在干净空环境执行 14.3 全部命令，审阅报告、脱敏 artifact、teardown 和最终 diff，更新全部 acceptance 状态                                   | 进入验证时：`IN_PROGRESS` |

工作包内部也按依赖顺序写代码：先 contract/type/enums，再 test-support/fixtures，再 spec，最后 runner/workflow/documentation。所有测试引用领域 enum 或生成 client，不复制魔法字符串。每个 acceptance ID 在验收清单中保留一行，不能删除失败历史或只记录最后一次 green。

### 14.3 最终唯一验证阶段

W8 开始前应确认 W1-W7 的文件全部完成、没有运行中的开发服务、Docker 空间充足，且真实 Provider/Railway 凭据只存在于受保护 GitHub environment。命令名属于本次重构必须实现的公开工程接口。

| 顺序 | 验证范围       | 最终命令/动作                                                                                                   | 通过证据                                                              |
| ---- | -------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1    | 可复现安装     | `pnpm install --frozen-lockfile`                                                                                | lockfile 无漂移                                                       |
| 2    | 仓库静态门禁   | `pnpm format:check && pnpm architecture:check && pnpm workflows:check && pnpm docs:check && pnpm secrets:check` | 五项 exit 0                                                           |
| 3    | 契约与生成物   | `pnpm api-contracts:check && pnpm api-operations:check && pnpm artifact:validate && pnpm harness:check`         | OpenAPI/operation/artifact/harness 一致                               |
| 4    | 全 workspace   | `pnpm ci:full && pnpm test:coverage && pnpm lexicon:check`                                                      | lint/type/unit/integration/build/docs/coverage/lexicon 全绿           |
| 5    | E2E 类型与计划 | `pnpm e2e:typecheck && pnpm e2e:plan -- --lane=pull-request`                                                    | 所有声明 test ID 被目标 project 收集                                  |
| 6    | Chromium 核心  | `pnpm e2e:core`                                                                                                 | identity/learning/Agent/Admin browser journeys 全部 first-pass        |
| 7    | 独占系统       | `pnpm e2e:system`                                                                                               | release、Job、数据治理和故障注入全绿；无重复副作用                    |
| 8    | 浏览器质量     | `pnpm e2e:browser-quality`                                                                                      | accessibility、mobile、Firefox/WebKit key journeys 全绿               |
| 9    | 本地完整矩阵   | `pnpm e2e:full`                                                                                                 | merged blob/HTML/JUnit/executed manifest 完整                         |
| 10   | 覆盖对账       | `pnpm e2e:reconcile -- --lane=pull-request`                                                                     | requirement -> collected -> executed -> passed 无缺口/flake/非法 skip |
| 11   | 受保护 AI      | 由用户手动触发 protected `provider-contract-smoke` 与 `agent-quality-eval` workflow；Codex 不自动调用真实模型   | DeepSeek transport/tool/JSON smoke、eval 阈值、预算与脱敏通过         |
| 12   | Railway 部署后 | 部署同一 SHA 后执行 `pnpm e2e:deployment` 和 scheduled synthetic rehearsal                                      | 十二服务 SHA/readiness、登录后关键路径、清理和告警证据通过            |
| 13   | 清理与审阅     | `git diff --check`，检查 report/diagnostics/secret/auth state，确认 Compose volume/network 已销毁               | 无非预期产物、敏感信息或残留测试资源                                  |

任一步失败，`E2E-13` 保持 `IN_PROGRESS`，受影响的源码项保持 `IMPLEMENTED`，不得因为源码已经写了提前变为 `ACCEPTED`。只有第 1-13 项全部闭合，才可以把 `E2E-01` 至 `E2E-13` 统一更新为 `ACCEPTED`，并声明主要功能端到端覆盖达到本文定义。

## 15. 验收清单

- [ ] 每个主要 journey 有一个真正从 UI 入口完成的 Chromium test。
- [ ] 所有 API/system 权限、并发、幂等和错误矩阵不与 UI journey 重复穷举。
- [ ] 自有十二个服务与基础设施使用真实镜像和边界；普通 CI 外网 Provider egress 关闭。
- [ ] Agent fake 验证编排，真实 Provider smoke 验证协议，eval 验证质量，三类结果独立报告。
- [ ] shard/worker/test 数据与 credential 全部隔离，任何顺序、单测重跑和并发运行均成立。
- [ ] Chromium、mobile、Firefox/WebKit 与 accessibility lane 的范围和频率明确。
- [ ] retry 后通过仍失败；trace/report/log 脱敏且可定位同一 run/test/commit。
- [ ] deployment synthetic 验证版本一致和至少一条登录后关键路径。
- [ ] requirement manifest、Playwright collect、实际 report 和 required gate 四者完成对账。
- [ ] 最终覆盖报告不再用“文件含 test ID”代表行为已执行。

## 16. 主要一手来源

- Playwright：[best practices](https://playwright.dev/docs/best-practices)、[API testing](https://playwright.dev/docs/api-testing)、[isolation](https://playwright.dev/docs/browser-contexts)、[authentication](https://playwright.dev/docs/auth)、[projects](https://playwright.dev/docs/test-projects)、[parallelism](https://playwright.dev/docs/test-parallel)、[CI](https://playwright.dev/docs/ci)、[sharding](https://playwright.dev/docs/test-sharding)、[retries](https://playwright.dev/docs/test-retries)、[accessibility](https://playwright.dev/docs/accessibility-testing)
- Testing Library：[guiding principles](https://testing-library.com/docs/)、[queries](https://testing-library.com/docs/queries/about/)
- Infrastructure/CI：[Docker readiness](https://docs.docker.com/compose/how-tos/startup-order/)、[Testcontainers Compose](https://node.testcontainers.org/features/compose/)、[Turborepo caching](https://turborepo.dev/docs/crafting-your-repository/caching)、[GitHub Actions artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data)、[environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)、[OIDC](https://docs.github.com/en/actions/reference/security/oidc)
- Security/AI：[OWASP ASVS 5.0](https://github.com/OWASP/ASVS/tree/v5.0.0_release)、[OWASP LLM06](https://owasp.org/www-project-top-10-for-large-language-model-applications/2_0_vulns/LLM06_ExcessiveAgency.html)、[OWASP LLM05](https://owasp.org/www-project-top-10-for-large-language-model-applications/2_0_vulns/LLM05_ImproperOutputHandling)、[NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework)、[NIST SP 800-218A](https://csrc.nist.gov/pubs/sp/800/218/a/final)
- Accessibility/operations：[W3C evaluation](https://www.w3.org/WAI/test-evaluate/)、[Google SRE monitoring](https://sre.google/workbook/monitoring/)、[OpenTelemetry GenAI](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)
