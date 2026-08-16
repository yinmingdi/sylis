# 测试与最终验收

## 1. 完成证据

重构完成只由最终完整矩阵、受保护 GitHub CI 和 staging evidence 共同证明。实现过程中允许运行窄范围诊断，但单包 green、started command 或早期局部结果不等于完成。

所有结构和功能改完后从干净依赖、空 PostgreSQL/Redis/Bucket 运行完整本地矩阵。任何失败修复后，先跑相关诊断，最后重新执行完整矩阵并 review final diff。

## 2. 静态门禁

- workspace 清单、package exports、direct dependency、forbidden import 和 app-to-app deep import；
- TypeScript local/workspace import 省略 `.js`/`.ts`；
- frontend bundle 不含 database、crypto server adapter、executor、compiler 或 provider adapter；
- Provider SDK 只能出现在 Model Gateway，仓库不存在 `@sylis/model-runtime`；
- Prisma schema + SQL-only invariants 覆盖 partial unique、deferred constraint、append-only 和 fencing；
- OpenAPI、Agent/Job/Artifact JSON Schema 和生成 client 无 drift；
- secret scan、license/rights metadata、Docker context 和文档链接/术语；
- 无旧 Word/Card/Chat/BackgroundJob/Worker/user-api/admin-web/runner/importer/phase command 的运行时引用。

## 3. 单元与 property tests

关键控制协议除普通断言外还必须有可执行 coverage threshold；v0.0.1 先对 deterministic Provider fixture protocol 强制 line/branch/function/statement 100%。Nightly 的 focused mutation 只变异该协议并要求 mutation score 不低于 90%，避免把全仓 mutation 变成不可用的长任务；扩展目标必须先有稳定、独立且非同义反复的测试。

| 模块              | 必测不变量                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Lexicon identity  | Form/Entry `INFLECTED_ONLY/INDEPENDENT_ONLY/BOTH/UNRESOLVED`、Sense/Concept 不误合并                                                           |
| Artifact          | stable ordering、canonical hash、schema/ref closure、unknown field/array 拒绝                                                                  |
| Exercise          | 13 task kinds、facet/direction/evidence/response/grading/validation 允许矩阵                                                                   |
| FSRS              | Objective 隔离、ReviewEvent 重放、Assessment 不更新记忆                                                                                        |
| Agent             | Session 单 Root Run、queued instruction、cancel/preempt、ChildRun 默认关闭/最多 3/depth 1、四种 wait                                           |
| Agent Runtime     | execution mode、visible immutable plan、capability routing/override、ordered blocks、有界调度、termination、无 hidden CoT                      |
| Proposal/Grant    | scope/expiry/max calls/action digest、参数变化失效、formal write 拒绝                                                                          |
| Job               | 六状态、terminal immutable、Attempt 编号、fencing、backoff、UNKNOWN_OUTCOME reconciliation、JobKindPolicy allow/deny                           |
| Credential/Crypto | owner XOR、per-record DEK/AES-GCM/AAD、fingerprint、KEK version、rewrap、normal revoke/security quarantine/restore、no plaintext               |
| Content/retention | upload intent、quarantine/CLEAN transition、revision pinning、DiagnosticBundle redaction、consent、immediate hide、purge CAS                   |
| Admin policy      | 七角色、组合 expression、role expiry/self-change/last-admin protection、SupportGrant allowlist/TTL、action digest、single-person v0.0.1 quorum |

随机测试使用固定 seed 并在失败输出最小 counterexample。时间、UUID、模型、provider、storage 和 Redis 均通过真实 seam 注入 fake，而不是修改业务 interface 只为测试。

## 4. PostgreSQL integration

从空库执行 Prisma force-reset 和 SQL-only invariants 后验证：

- release-scoped FK、immutable revision、Sense parent no-cycle、relation canonical order；
- Objective typed subject、Exercise response XOR、Attempt/Review append-only；
- 每 Session 可有多个 QUEUED Root Run、至多一个 RUNNING/WAITING Root Run、ChildRun 数量/深度与 WaitCondition 一致性；
- 每个 AgentRunStep 恰好关联一个 ModelInvocation；Provider transport retry 只新增 ModelInvocationAttempt；同一步相同输入的两个 ToolCall 身份独立且每个 accepted call 恰好一个终态结果；
- 每个 AgentMessageBlock 恰好一个匹配 kind 的 typed child/reference；同 Message parent、无 cycle、同级 position 唯一、深度/数量有界，`modelPosition + modelSubPosition` 与 parser 顺序一致，fragment 四元键幂等，sealed/interrupted 后不可改写；
- JobAttempt lease/fencing CAS、旧 token 晚到提交失败、并发 claim 只有一个赢家；
- outbox commit/wakeup、Redis 清空后 polling 恢复；
- activation target 必须 VALIDATED，Publisher role 不能写 active pointer；
- Agent Executor role 不能写 Agent、Learning、Lexicon、Reading 或 Identity 表；
- Gateway permit 原子单次 claim、exact route/credential fixed、usage reservation/settlement 和 Profile owner XOR；
- Asset Processor role 只能推进明确 processing/derivative，未 READY revision 无法成为 context/download target；
- Evaluator 无权读取 production Session 或激活 release；
- User deletion projection 立即隐藏，purge queue 和 audit 可证明期限。
- CollectedLexicalItem current revision 同 item、每 revision 一个 typed target，旧 revision 仍可被 SupportGrant 精确引用；
- OperatorBootstrapState 只能从零 assignment 消费一次，目标必须 VERIFIED MFA；recovery 只在零有效 SECURITY_ADMIN 时授予一个 SECURITY_ADMIN；
- SupportGrant 只引用五种 allowlisted exact revision、默认 2h/max 24h、指定 SUPPORT Operator；越权/过期/撤销/通配全部失败且每次读取写 DataAccessAuditEvent；
- SecurityAuditEvent/DataAccessAuditEvent append-only，两级 retention、LegalHold、archive hash 和 AuditExport expiry 受约束；
- DeploymentRelease browser role 无写权限，只有 CI service identity ingestion。

真实数据库竞争测试不能由 in-memory repository 代替。

## 5. Agent 与模型 contract

普通测试只启动 Model Gateway + fake Provider server：固定 stream、structured result、单/多 tool request、mixed text/tool、429、timeout、abort、usage、unknown outcome 和 invalid schema。对 DeepSeek/OpenAI/Anthropic/Gemini adapter 使用本地 fake server contract，验证 interleaved block 映射、唯一 terminal frame、permit、redaction、retry classification 和 usage settlement，不产生付费调用。

端到端场景：

1. User 创建 Session，AUTO/显式 Capability 固定 execution mode、CapabilityRelease、ProviderRouteRelease 和 CredentialRevision；workflow/loop 固定 visible plan。
2. Agent tool read、private write Proposal、批准/拒绝、WAITING 后新 activation Job。
3. SSE 断线/重连和 Redis/API/executor restart 不重复 invocation、tool side effect、Artifact revision 或费用。
4. BYOK invalid/expired/429 返回明确错误且平台 ledger 不增加。
5. 缺词只产生私人 Artifact + dedup GapReport；正式 Lexicon/Exercise/FSRS 不变。
6. Support 无 exact-resource Grant 看不到明文；Grant 只能读取固定 revision，每次读取都有 DataAccessAuditEvent，Agent 问题只能使用 User 确认的 DiagnosticBundleRevision。
7. User upload 只能从 quarantine 经 scan 到 READY；Agent context 固定 asset revision，Artifact accept 幂等创建新 revision。
8. optional full exchange 拒绝/撤回不影响基础聊天；Admin/support 始终只能看 exchange metadata，撤回内容按期限 purge。
9. Provider timeout/429 仅在尚无 accepted normalized block、visible fragment、tool call 或 usage 时允许 transport retry，只新增 ModelInvocationAttempt；AgentRunStep、Message、Block 与输入 identity 不变，部分流不自动续传。
10. Executor 在工具完成后、receipt 提交前后分别重启；恢复只补交缺失 receipt，不重放任何已终态 ToolCall。
11. Browser 在 streaming Block 中途断线只携带 `Last-Event-ID` 重连同一 Session SSE；snapshot + cursor 按 `(invocationId, modelPosition, modelSubPosition, fragmentSequence)` 恢复，无重复/缺失 fragment，不新建 Run/Invocation。
12. User 请求浏览器本地文件、shell、任意 MCP 或本地 Connector 时得到 typed v1 rejection，前端不执行或尝试建立第二条本地 Agent 链路。
13. 同一步输出 mixed text + 三个 ToolCall，parallel-safe 调用在有界池重叠，exclusive 调用形成 barrier；一个调用失败不伪装 sibling，receipt 仍按模型顺序进入下一 invocation。
14. Provider 在 headers 后失败只产生一个 in-band terminal failure frame；Invocation/permit/usage 均进入终态，客户端不收到第二个 HTTP Problem Details body。
15. 标题/列表/代码/table/citation/ToolCall/Proposal/Wait/Artifact 混合 Block tree 在 desktop/mobile/keyboard/screen-reader 下保持顺序、焦点和 exact revision。

## 6. Lexicon pipeline

固定 200 词 fixture 覆盖：多 POS、多 Sense、过去分词 Form + 独立 Entry、multiword/collocation、同义/反义、morphology/frame/example、来源冲突、缺失状态和 AI candidate。

验证：

- source -> compiler -> 一个 `.json.zst` -> publisher -> empty DB release 的逐实体映射；
- 流式解压、compressed/content hash、schema、引用、rights、profile 和 deterministic rebuild；
- Publisher 不依赖 compiler/model，Builder 不能写正式 release；
- crash/checkpoint/lease takeover、同 Artifact 幂等 publish、失败 staging 清理；
- VALIDATED 不自动 active，activation/rollback 是独立 Admin command。

真实 200 词模型 pilot 只在所有 fake/结构门禁通过后由 User 手工运行；full generation 不属于普通 CI。

## 7. API contracts

- User、Admin、Agent 三个 OpenAPI contract 与 `@sylis/api-client` subpaths 一致；
- USER/ADMIN/AGENT/service audiences 不能互换；CSRF、Origin、MFA、re-auth、securityVersion 生效；
- mutation 幂等、409 hash conflict、422 schema/domain error 和 RFC 9457 problem；
- release-pinned read、ETag/cursor、owner isolation 与 redacted Admin projection；
- Agent executor 的 Block fragment、Step proposal 与 Step receipt ingress 验证 service grant、run/step/invocation/fencing token、Grant、schema 和 digest；POST `/messages`、generic `/actions` 与 generic `/blocks` 都返回不存在；
- ordinary read revocation cache 上限约 2 分钟，敏感 write 每次在线校验。
- Admin API 对 Identity、Agent 和 Model owner 使用 typed internal interface；跨 owner repository write、错误 audience 和 browser DeploymentRelease write 全部拒绝。
- Admin list/cursor/ETag、Job SSE Last-Event-ID、RFC 9457、high-risk target revision/reason/action digest/idempotency contract 无 drift。

## 8. Frontend e2e 与视觉

Desktop/mobile Playwright 覆盖 Web/Admin 主要 route、注册/登录/MFA、词典详情、学习、13 task 中可由四个 v1 renderer 表达的练习、Reading 和 Agent workspace。PR/main 用 Chromium 跑完整流程、用 axe 扫描公开与认证后 Web/Admin shell，并用 Firefox/WebKit 做静态资源和 JavaScript shell smoke；nightly 再用 Firefox/WebKit 跑完整 User/Admin/Agent compatibility projects。

Agent 专项覆盖三栏/全屏布局、context side panel、queued instruction、cancel/preempt、stream reconnect、typed MessageBlock tree、ToolCall、WaitCondition、Proposal、Artifact inspector、BYOK failure 和删除状态。至少覆盖长文本、code/table/citation、unknown schema、interrupted Block、同一卡片状态更新与 exact Artifact revision；检查文字不溢出、控件不移位、无重叠、键盘/焦点/aria-live 可用。

Admin 覆盖六组导航与全部 route：permission-scoped Overview；Source/Rights/Build/Review/Publish/Activation；redacted Agent Run 与 Agent Release；Route/Credential/Budget；Asset/Job；User Support/Operator Roles/Audit；只读 Deployment。

高风险 e2e 覆盖 re-auth、role conjunction、single-person v0.0.1 quorum、CandidateRevision invalidation、WARN/ERROR、Credential/Route/Agent quarantine/revoke/restore、用户安全锁定、AuditExport 和 LegalHold。SupportGrant 覆盖 User 预览/确认 DiagnosticBundle、2h/24h、撤销和绝不解锁 Exchange/BYOK/hidden reasoning。Route guard 失败不能代替 API deny test。

## 9. 容器与 Railway-like smoke

十二个 image 都执行 build、start、liveness/readiness 和 graceful `SIGTERM`。检查 image 不含 `.env`、`.git`、`.work`、source dump、`img/`、`img.zip` 或测试 key。

用隔离 PostgreSQL/Redis 和 quarantine/clean/system 三类 S3-compatible storage 模拟 staging：database install -> services -> fixed Artifact publish -> upload/scan -> fake invocation -> smoke -> shutdown/restart。确认 private backend 不需要公网业务 URL，public health 不泄露 config。

staging 与 production 在 HTTP health rehearsal 之后还要运行独立 `tests/deployment` Playwright synthetic project，分别打开 Web/Admin 登录入口，证明 document、script、stylesheet 和前端 hydration 均成功。它只消费环境配置的 public origin，不持有业务账号或 provider secret。

## 10. CI 与 release evidence

PR required summary 聚合 lint、typecheck、tests、build、contracts、security 和 docs。green main 构建十二个 GHCR digest、部署 staging 并保存 manifest/smoke。protected release 验证 manifest 与 approval，production 提升同一 digest；CI 断言 staging/production digest 完全相等。

`v0.0.1` evidence 至少包含 commit、tag、workflow run、十二个 digest、SBOM/provenance、Prisma schema/invariant hash、Artifact schema/hash、permit/credential/file isolation、staging smoke、maintainer approval、production deployment 和 rollback manifest。
