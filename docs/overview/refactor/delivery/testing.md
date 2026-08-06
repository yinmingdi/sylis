# 测试、质量门禁与验收

## 1. 阶段化执行策略

本项目遵循 [ADR 0011](../../adr/0011-phase-gated-greenfield-refactor.md)：测试代码、fixture、contract 和可观测性与实现一起准备，但本地不在每个小改动后反复执行测试并宣称局部完成。实现者在一个 Phase 内完成该阶段的全部交付面，到阶段边界才一次性运行该阶段完整矩阵。

执行规则：

1. 阶段开始前固定目标文档、输入、输出、禁止依赖和本阶段命令矩阵。
2. 阶段内允许 format、编译错误定位、单个失败复现等窄诊断；这些结果不计入完成证据。
3. 阶段代码和测试准备完成后，从干净依赖/数据库/fixture 状态运行完整阶段矩阵。
4. 任一检查失败就修复实现；修复后重跑完整阶段矩阵，而不是只重跑曾失败的命令。
5. 记录 commit SHA、完整命令、退出码、artifact/schema hash 和人工验收证据；未记录等同未验证。
6. GitHub required checks 在每次 push/PR 仍必须执行，阶段策略不能禁用或绕过 CI。
7. 只有当前 Phase 全绿且 diff 对照目标文档审核通过，才能开始下一 Phase。

### 1.1 Phase gate 矩阵

| Phase | 一次性执行的完整门禁                                                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | VitePress build、内部链接/表格、artifact Draft 2020-12 Schema 编译、示例验证、secret scan、pnpm/Turbo graph、exports/allowlist、format/diff check                                            |
| 1     | `lexicon-contracts`/compiler lint、typecheck、unit、source fixtures、语言学 golden、artifact references/profiles、determinism、200 词无 AI + 真实 AI pilot、forbidden dependency             |
| 2     | Prisma validate/generate、fresh migration、Job state property tests、Runner/Importer contract + PostgreSQL integration、COPY/dry-run/import/validate/rollback、crash/lease/checkpoint resume |
| 3     | API/Worker/Admin/Web architecture、Identity/session/CSRF/MFA/RBAC integration、双 OpenAPI client、User/Admin shell Playwright、BackgroundJob/SSE/Redis-loss                                  |
| 4     | Lexicon/Books/Study/Exercises/Assessments/Notebooks 全部 unit + DB integration + API contract + Web Playwright、FSRS replay、13 task matrix、GET zero-write/N+1 budget                       |
| 5     | Reading/Reddit/Tutor/Grammar/AI Reading unit + integration + provider fake、SSE resume、budget、encryption/retention、User Web Playwright                                                    |
| 6     | 全 workspace lint/typecheck/unit/contract/integration/build/e2e、fresh DB + full artifact import、production-like staging、六镜像、security/performance、应用/数据/Job rollback 演练         |
| 7     | 受保护 release required checks、GHCR immutable digest CD、migration、所有服务 health/smoke、Lexicon activation、deployment/release/hash 审计和 `v0.0.1` 证据                                 |

Phase 0-5 的通过只证明对应边界；Phase 6 必须从头运行全产品矩阵，不能复用早期局部绿灯代替。Phase 7 不重新构建不同产物，只部署 Phase 6/受保护 CI 已证明的同一 commit 和不可变 digest。

Phase 1 有两个不可互相替代的门禁：`pnpm phase1:check` 是 PR/本地可重复执行的离线 fixture 矩阵，只证明 adapters、contracts、compiler、流式 artifact 和固定 AI responses；它不是“200 词 pilot”。`pnpm phase1:pilot` 是受保护环境中的独立 exact-200 门禁，要求干净 commit、真实且 checksum-pinned 的 source manifest、真实 provider/模型、独立预算和加密 candidate cache。它依次生成恰好 200 个已发布 Headword 的无 AI artifact、首次真实 AI artifact 和缓存重放 artifact；首次运行必须有真实 provider calls，重放必须全部 cache hit、零 provider task call、零新增 cost，并验证两次 AI artifact byte-for-byte 一致。validator evidence 包含 content profiles、coverage、source/exercise statistics 和 hash 选出的 20 个稳定样本。

exact-200 的无 AI artifact 必须实际包含来源支持的 `LEARNER_EXPLANATION`、`MORPHOLOGY_WALKTHROUGH` 和逐 block 引用直接来源 evidence 的 `CULTURAL_CONTEXT`；真实 AI 与缓存重放 artifact 还必须包含 `MNEMONIC` 和 `MICRO_STORY`。五类 material 必须从标准 artifact 的 `quality.exerciseStatistics` 验证，不能用孤立 planner unit test 或模型返回值代替发布实体证据。

protected pilot 的运行 manifest 必须在目标 commit 确定后从已审核模板物化到 ignored/external 路径，把 `release.gitCommit` 绑定到当前干净 `HEAD`，并引用 `sylis.headword-set/1` 的 exact-200、version 和 SHA-256；禁止修改被跟踪 manifest 后假称它仍属于修改前的 HEAD。离线门禁覆盖重复 target、未规范化 target、checksum/version 错误、缺失 source target、无法发布为 Headword、rich target 越界，以及交换 source manifest 顺序后 artifact byte-for-byte 不变；任何一项失败都不能回退为“来源前 200 行”。

人工抽检采用绑定证据的两步流程：首次 pilot 生成无 AI、首次真实 AI 和 cache replay 三个 artifact，通过机器门禁后把不可变结果、首次调用 metrics 和 artifact SHA-256 冻结到 `.work/phase-1-pilot/pilot-state.json`，并在 `review-request.json` 写入 commit、pilot state SHA-256、AI content hash、profile/coverage 摘要和稳定样本后停止。reviewer 必须在输出目录外填写 `reviewer`、`approved=true`、全部 `reviewedHeadwordIds` 和 notes，再通过 `LEXICON_PILOT_REVIEW_FILE` 运行 approval pass。approval pass 不读取 AI API/cache key、不重新 compile 或调用 provider；它重新流式验证已冻结的三个 artifact，核对 state/manifest/model/预算/价格/并发和字节 hash 后才接受同一 commit、同一 state/content hash 且覆盖全部样本 ID 的 approval，并将其原样写入 evidence v3。任何 state/artifact/review 漂移都必须丢弃本轮并从首次 pilot 重新开始，不能在审核后重新生成内容。evidence v3 记录 source manifest SHA-256、artifact manifest 中的来源/headword/rich-target checksums、compile profile、validator、prompt/candidate schema/model policy、请求与实际 provider/model、预算价格快照和并发度；不记录任何 provider key 或 cache key。只有同一目标 commit 的离线 gate、真实 AI/cache replay 和人工抽检证据全部通过，Phase 1 才算完成；任一缺失都不得进入 Phase 2。

## 2. 测试分层

| 层级                 | 运行位置                       | 证明什么                                               |
| -------------------- | ------------------------------ | ------------------------------------------------------ |
| schema/unit          | local + every PR               | normalize、stable ID、typed relation、scoring 等纯逻辑 |
| compiler fixture     | local + every PR               | 各 source adapter 到 candidate 的确定性转换            |
| artifact contract    | local + every PR               | JSON shape、hash、顺序、引用和 profile                 |
| database integration | CI PostgreSQL                  | migration、constraint、COPY、事务和 query projection   |
| API contract         | CI                             | OpenAPI、错误、权限、幂等和 release pinning            |
| Web component/e2e    | CI + staging                   | 交互、可访问性、响应式和不泄露答案                     |
| full data validation | protected Railway compiler run | 全量语义、coverage、来源权利和异常分布                 |
| deployment/cutover   | staging + protected production | migration、health、activation、rollback 和审计         |

PR CI 不需要真实 AI、Railway 或生产数据库密钥。AI 行为通过固定 candidate/response fixtures 测试；真实 provider pilot 只在手动受保护 workflow 中运行。

## 3. Artifact contract

### 3.1 结构与资源限制

- 使用支持 Draft 2020-12 和 `format` assertion 的真实 validator 编译正式 Schema，并校验顶层字段、discriminated union、枚举、长度、数量和 `additionalProperties`；仅 `JSON.parse` 或检查 `$ref` 存在不算通过。
- 正式文档中的最小/完整 JSON fixture 必须通过 Schema；对每个 definition/translation/usage/concept definition 和 learning union 都有一条最小合法与未知字段非法 fixture。
- 拒绝未知 schema major、超过 validator 固定 `maxDepth` 的嵌套、超过 `maxStringBytes` 的单个 key/value、重复 object ID 和超过 manifest limit 的数组；字符串限制在 token 流入期间执行，不能等整个实体 materialize 后才检查。
- 所有 collection 即使为空也输出 `[]`；可选 scalar 明确输出 `null`。
- `.json.zst` 的 compressed bytes、decompressed bytes 和 compression ratio 都有上限；拒绝多 member/frame、trailing data、截断和 checksum 错误。
- 解压后只允许一个 UTF-8 JSON root object；streaming parser 在固定内存预算下验证，不能依赖整体 `JSON.parse()` 或落地第二份完整 JSON。

### 3.2 确定性和 hash

同一固定输入、compiler/zstd major、compression config 运行两次并断言 `.json.zst` byte-for-byte 相同；另解压并断言跨 compressor 的 canonical `contentHash` 相同。覆盖：

- NFC 在 stable ID/hash 前完成；
- object 使用 RFC 8785 规则；
- 每类 array 按文档化 business key 排序；
- source checksum、builder commit、schema/prompt/model/validator version 进入 manifest；
- `contentHash` 从排除自身后的 canonical payload 计算；
- timestamp 只来自显式 build clock，不把当前时间散落到实体。

### 3.3 引用完整性

建立 disk-backed ID index 后验证：

- 每个 typed reference 的目标类型存在；
- release-scoped source/target 属于正确 release；
- parent Sense 同 Entry 且无环；
- 每 Sense 至多一个 canonical Concept membership；
- 每 ObjectiveRevision 恰好一个 primary typed subject；
- 每 ObjectiveRevision 的 knowledge facet、接受/产出方向和 subject 类型组合合法；
- ExerciseRevision、ObjectiveRevision、stimulus 和 choice/correct response 同 release；
- 每个可调度 PUBLISHED Objective 至少有一个同 release 的 PUBLISHED Exercise；
- `exerciseTaskKind + facet + direction + evidence + response/cardinality/placement/grading + validationLevel` 通过受控允许矩阵；
- blueprint 的 pinned item、scope 和 quota 可被解析。

Schema 中所有 entity arrays 必须与 importer mapping registry 双向一致；新增数组无 mapper、一个数组映射两次或 runtime-only 表被声明为 artifact owner 均阻止 CI。`CURRENT` stable identity 与 revision 一一对应；`LINEAGE_ANCHOR` 无 revision 但必须恰好被合法 lineage 使用。

## 4. 语言学 golden fixtures

| fixture                     | 必须证明                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `bank`                      | 名词/动词及不同同形词 Entry 不混合；各 Sense/Concept/etymology 保持独立                 |
| `run`, `runs`, `ran`        | `runs/ran` 是 `run` 的 Forms；真实独立 Entry 仍可并存                                   |
| `break`, `broken`           | `broken` 同时可作为 break 的 past participle Form 和独立 adjective Entry                |
| recursive senses            | parent/child 顺序稳定、无环、定义/翻译/例句不跨层错绑                                   |
| `helpful advice`            | Collocation 组件、Sense binding、翻译和 observation 分开                                |
| `prevent sb from doing sth` | Frame slot、syntactic argument、semantic argument 和 mapping 对齐                       |
| synonyms/antonyms           | synonym concept membership 与 Sense relation 不混；antonym 不落在 Headword              |
| hypernym                    | 只连接 Concept；不能创建 Sense/Entry 级 `HYPERNYM`                                      |
| abbreviation                | 只连接 Entry；目标必须存在或 candidate 被拒绝                                           |
| morphology                  | `help + -ful` 是 derivation；比较级是 inflection；segment offsets 不切 grapheme cluster |
| multiword                   | phrasal verb、idiom、free collocation 和 ordinary phrase 不因空格统一成一个类型         |

每个 fixture 都从 source record 走完整 normalize/resolve/promote/artifact/import 路径，不只测试最终手写对象。

## 5. 来源合并与 AI

- ECDICT exchange 只能产生 Form/FormFeature candidate；考试 tag 只能产生 book membership evidence。
- Kaikki form-of 既可支持 Form，也允许有证据的独立 Entry；resolver 输出 decision reason。
- OEWN synset ID 稳定映射 Concept；WordNet 未覆盖不等于 `NOT_APPLICABLE`。
- 有道相同内容跨书只建一个事实，保留多条 evidence 和多个 book item。
- source conflict 不覆盖 raw candidate；promotion 记录 chosen/rejected reason。
- source manifest 缺失 rights 或 attribution 直接失败；公开 artifact 对任一 `mayBuild/mayServe/mayExport=false` 的来源都拒绝 promotion/export，不能只隐藏 raw payload 后继续发布派生事实。
- AI strict JSON 之外还必须通过本地 schema、reference、language、source boundary 和 semantic validators。
- AI 不得发布无来源 IPA、真实考试 citation、corpus frequency、官方 CEFR claim 或词源。
- 五类 PedagogicalMaterial 均覆盖 valid/rejected/not-applicable fixture；生成结果必须是 typed blocks，不接受 DictionaryByGPT4 风格的 Markdown content blob。
- learner explanation 不跨 Sense；morphology walkthrough 的每个 segment/formation ref 必须存在；cultural fact block 必须引用 source-backed ContentEvidence。
- mnemonic 必须标记 GENERATED 且不得伪造词源；micro-story 必须包含 target mention、正确使用目标 Sense，并通过原文/译文一致性和长度/安全检查。
- material-as-stimulus 只能引用同 release immutable revision；复制故事正文而不是引用必须被 dedupe/semantic validator 拒绝。
- candidate key/cache 使 retry 不重复收费；429/5xx backoff、budget stop、truncation 和 invalid JSON 都有测试。
- bounded concurrency 保持结果稳定顺序且不超过配置上限；cache miss 在 provider 调用前完成预算 reservation，并发 reservation 不得越过 hard cap；加密文件 cache 的并发写后重开必须能读回每个 candidate。

## 6. 题库质量

### 6.1 每题不变量

每个发布 ExerciseRevision 必须通过：

1. 唯一 primary Objective subject，knowledge facet、retrieval direction、exercise task、evidence kind 和题干确实一致。
2. stimulus 含有作答所需上下文，但不直接泄露答案。
3. 除 `NO_CAPTURE + SELF_REPORT` 外 correct response 非空且可由服务器确定评分；合法别名被显式列出。NO_CAPTURE 必须有可验证的 REVEAL stimulus。
4. choice ID 稳定，correctness 不依赖 author/presentation order。
5. 所有选项 normalized distinct；干扰项不是同义正确答案或另一种合法拼写。
6. 干扰项在相同语法位置、POS、语言和近似难度下仍然错误且合理。
7. 选项长度、格式、标点和唯一词性提示不泄露答案。
8. feedback 对应具体混淆点，不引入未经来源支持的新词典事实。
9. semantic signature 与题库去重结果一致。
10. source/provenance、template/generator/verifier version 和 validation level 完整。

### 6.2 题型 contract

- `CHOICE/SINGLE`：恰好一个正确 choice，`maxSelections=1`；`CHOICE/MULTIPLE` 明确 partial scoring 且 weights 可重复计算。
- `SHORT_TEXT`：大小写、附加符号、空白和 Unicode normalization policy 固定；accepted aliases 不通过模糊 contains 判断；INLINE 只允许 SINGLE。
- `EXTENDED_TEXT`：固定语言、字符/词数边界和 rubric，只能 BLOCK/SINGLE/PRACTICE_ONLY。
- `NO_CAPTURE`：只能 SINGLE/BLOCK/SELF_REPORT/PRACTICE_ONLY；必须有 REVEAL stimulus，不产生 text/audio/ASR response。
- `SELF_REPORT`：服务器不伪装自动判分；reveal、self report 和之后的 FSRS rating 分开保存。
- `SELF_REPORT`、`AI_ASSISTED`、开放翻译/造句和 AI-only scoring 不能成为 `SUMMATIVE_VERIFIED`。
- 13 种 `ExerciseTaskKind` 均有至少一个合法组合和一个非法组合 fixture；非法组合在 compiler 与数据库两层失败。
- `SPOKEN_FORM_PRODUCTION` 只使用 NO_CAPTURE/reveal/self-report；未来 matching/token assembly/audio recording 必须新增 typed response 表和 consent/retention contract test，不能塞进无版本 payload。

### 6.3 去重、洗牌和污染

- 同 target/prompt/correct response 的 source/AI candidate 合并 evidence，不复制题。
- 修改任一干扰项会产生新 revision 和新 content hash。
- property-based test 对所有 choice permutation 断言评分相同。
- session item 固定实际 presented choice order；重载页面不重新洗牌。
- 同一 summative section 默认不出现相同 Objective、相同答案线索或共享 stimulus 的近重复 siblings。
- 最近看过的 ExerciseRevision 按 blueprint lookback 排除；题库不足时明确失败或降级，不静默重复。
- source exercise、确定性模板和 AI candidate 使用同一 semantic signature；重复时合并 evidence，不按来源复制题。

## 7. 组卷与统计

使用固定 `selectionSeed` 重放组卷并断言：

- section 递归无环且 question count 正确；
- knowledge facet、retrieval direction、task、evidence kind、response kind、validation level、difficulty、book scope 和 pinned item quotas 全部满足；
- hard constraints 先满足，权重只在 eligible pool 内排序；
- 同一 release/blueprint revision/seed/user exposure snapshot 得到相同 session items；
- session 保存 selection algorithm version、item/choice order 和 max score；
- 客户端拿不到 correct response，提交伪造 choice ID 返回 422；
- score、partial credit、timeout、submit idempotency 和 concurrent submit 可重复验证。

  0.0.1 不建立 usage aggregate、calibration、IRT 或 CAT 测试路径，也不从作答推导 CEFR、词汇量或能力估计。结果测试只验证 blueprint 明确定义的 raw/domain score；未来统计必须另立 ADR、schema 与隐私门禁。

## 8. FSRS 与学习事件

- 用固定 parameter set 和 review event 序列 golden test 校验 ts-fsrs 输出。
- 从零重放所有 ReviewEvent，得到的 state/due/stability/difficulty 与 `UserObjectiveMemoryState` 快照相同。
- start/response/review 三类 duplicate `Idempotency-Key` 均不生成第二份事实；相同 key 不同 payload 返回 conflict。
- 每个 Attempt 恰好关联 DailyStudyPlanItem 或 AssessmentSessionItem 之一；STUDY/ASSESSMENT context XOR、attemptNo 和 typed response FK 均由数据库测试覆盖。
- Attempt 创建时固定 ExerciseRevision 与 presented choice order；只允许 PRESENTED -> SUBMITTED/ABANDONED/EXPIRED，终态不能再次改写。
- ReviewEvent 只能引用同 ObjectiveRevision 的 STUDY attempt；ASSESSMENT attempt 不更新 FSRS。
- presented choice 顺序被完整保存，selected choice 必须是该 attempt 实际展示且属于同 ExerciseRevision 的 choice。
- correctness、FSRS rating、hint/reveal 和 input mode 是不同字段，不互相推断覆盖。
- ObjectiveRevision 更新不篡改旧 event；新复习明确记录当时 revision 和 parameter set。
- timezone/DST 边界下 `DailyStudyPlan.localDate`、due query 和完成计数一致。

## 9. Importer 与 release

在临时 PostgreSQL 覆盖：

1. fresh migration + dry-run 全程不写正式表；
2. COPY staging count/checksum 与 manifest 一致；
3. invalid FK、duplicate business key、cycle 和 source restriction 阻止 build；
4. 同一 artifact 重试复用 import/build identity，不复制事实；
5. 进程在每个 phase 中断后可从 checkpoint 恢复；
6. DRAFT 对线上查询不可见；VALIDATED 才允许 activation；
7. activation 单事务追加 audit 并切 `activeReleaseId`；
8. rollback 只切回上一个 VALIDATED release；
9. 并发 activation/import lock 正确；
10. progress event 包含 phase、processed/total、rate、ETA、heartbeat 和最终摘要。

## 10. API 和 Web

API contract tests 覆盖 `/api/v1` 与 `/api/admin/v1` 分离、active release pinning、Notebook CRUD/typed target ownership、cursor 签名、ETag、RFC 9457、opaque session、CSRF、ownership、idempotency、422/409、无 N+1 budget 和 GET 零写入。`openapi-typescript + openapi-fetch` 生成的 User/Admin clients 必须与 committed OpenAPI snapshot clean，且 import graph 证明彼此不越界。

architecture test 扫描每个 API module 的 public `index.ts` 和 Nest module exports，阻止跨模块 deep import、导出 repository 实现、Worker/Runner/Importer 导入 API 源码，以及 controller 直接调用 repository。前端 import graph 阻止 `modules` 反向依赖 `pages/app`、page 穿透 module 私有目录、component 直接 `fetch`、User Web 引入 Admin client 和 server response 进入 Zustand。

Identity/User integration 覆盖：注册不泄露邮箱存在性、Argon2id credential、session token 只存 hash、登录/改密/角色变化轮换、logout/revoke 立即失效、USER/ADMIN audience 不互换、所有用户事实的 `userId` 与 session 主体一致、并发 consent 产生 append-only 决定，并确认不存在 profile 创建、切换或代管接口。

Admin auth integration 覆盖 password + WebAuthn、password + TOTP、未验证/撤销 factor、challenge replay/expiry/concurrency、origin/RP ID/counter、recovery code 不能直接签 Admin session、独立 cookie/CSRF bootstrap 和轮换，以及密码/MFA/role generation 变化后已有 ADMIN session 立即失效。

Playwright 至少覆盖 desktop/mobile：

- 多 POS/homograph tabs、深层 Sense、长英文/中文、五类 PedagogicalMaterial、按需加载、引用和四种 completeness 状态；
- forms、同反义关系、collocations、frames、morphology 分区不混排；
- 今日学习、Objective 详情、hint、choice single/multiple、short text/inline cloze、extended text、self report、feedback、FSRS rating；
- form/meaning、听辨/听写、朗读 reveal/self-report、语境义项理解、搭配、Frame、关系、构词、usage constraint 和开放产出 task 的代表组合；
- assessment start/resume/timeout/submit/result/history；
- 注册/登录/session expiry、consent、设备撤销、导出/删除请求；
- Tutor 单 message SSE 恢复、Grammar typed result、AI Reading Job progress/failure、Reading annotation/resolve/saved/history、Reddit source edit/withdrawal；
- 4+ choices、键盘、screen reader labels、aria-live、reduced motion；
- 离线时不排队提交答案/Review/聊天/consent，重试复用 idempotency key；覆盖过期 cursor/session 和 release 切换，logout 或 session 主体变化时清空用户 cache；
- 文本无重叠、选项不跳动、HTML/日志/网络响应不泄露答案或密钥。

## 11. Admin、Worker、AI 与隐私

- 固定四种 operator role 逐 endpoint 生成 allow/deny matrix；仅隐藏 UI 不算通过。
- re-auth、action digest、不同账号双人审批、过期 role、并发批准和 audit append-only 都有集成测试。
- 所有 JobKind 覆盖 `QUEUED/RUNNING/RETRY_SCHEDULED/PAUSED/SUCCEEDED/FAILED/CANCELLED` 合法转换、terminal immutable、checkpoint schema/version、lease CAS/takeover、最大重试、cancel race、SIGTERM drain 和 SSE `Last-Event-ID`；Worker、Compiler Runner、Importer 分别只 claim 自己的 kind。
- Redis wake 消息丢失、重复、乱序和 Redis 重启不会丢 Job 或重复领域结果；PostgreSQL poller 能恢复执行。
- AI ledger 在并发 reservation 下不超 hard cap；80% 告警、100% 停止新调用、追加审批后恢复；runtime/compiler 账本和 key 不能互用。
- fake `StructuredGenerationPort`/`StreamingGenerationPort` 覆盖 streaming truncation、429、5xx、schema invalid、tool injection、超时、abort 和 provider completed 但 local validation rejected；业务测试不 import DeepSeek SDK。
- 聊天、开放作答、阅读原文、prompt/output 的 ciphertext、key version、purpose、consent 和 owner 完整；普通 log/trace/analytics 不出现正文。
- field-encryption key rotation、authorized decrypt audit、export、delete/tombstone 和 backup restore 行为必须演练。
- source rights withdrawal 会阻止新 artifact/隐藏受限内容；公开有道和永久可识别留存两个 production blocker 未关闭时，launch gate 必须失败。

性能采用有上限的回归门禁而非虚构 DAU/RPS 目标：对固定数据集记录 API p50/p95、SQL query count、Worker throughput、Importer rows/s、compiler peak RSS 和 Web route bundle；超过已批准 baseline 容差即失败。容量目标确定后再建立独立 SLO/负载模型。

## 12. CI acceptance gates

`release/0.0.1 -> main` 的 required checks 至少包括：

- secret scan、dependency/license policy；
- format、lint、typecheck；
- pnpm package graph、Turbo task graph、exports/module-boundary architecture tests；PR `--affected` 与 release 全量 graph 均通过；
- Prisma validate/generate 和 fresh DB migrate；
- compiler/importer unit、fixture、artifact、idempotency tests；
- API unit/integration/contract/build/health；
- Worker unit/integration/lease/checkpoint/drain/readiness、Redis-loss 与 runtime provider fake tests；
- Compiler Runner 的 `LEXICON_BUILD` claim、budget、resume、progress、artifact upload 和 Worker/API source-import 禁止测试；
- User Web/Admin typecheck/unit/Playwright/build/container health；
- User/Admin OpenAPI 3.1 snapshot、`openapi-typescript + openapi-fetch` generation、breaking check 和 cross-import boundary；
- security matrix、CSRF/session/RBAC、field-encryption、log-redaction tests；
- docs build、dead-link、Mermaid rendering；
- `git diff --check` 和 artifact/schema generated-file clean check。

production smoke test 是部署门禁，但不能替代 PR CI。任何 required check 被跳过、取消或使用真实业务 key 才能通过，均视为失败。

## 13. 全量数据验收报告

每次 lexicon build 输出机器可读 `quality` 和人类摘要，至少包含：

- 各实体/来源/词书/词性 count 与前一 release diff；
- unresolved、conflict、rejected、missing/not-applicable 分布；
- orphan、cycle、relation level、duplicate、empty text 计数；
- 每个 content profile pass/fail 和 top rule codes；
- AI task 数、cache hit、tokens、cost、validation reject 和人工抽检结果；
- knowledge facet/retrieval direction/evidence kind/response profile/target/difficulty/source/material coverage 与重复率；
- artifact bytes/hash、build duration、peak memory 和 importer throughput。

任何 ERROR、未解释的大幅 count 波动、rights violation 或 hash 不确定性都阻止发布。warning 必须有 owner、reason 和接受期限，不能用“数据很多”整体豁免。
