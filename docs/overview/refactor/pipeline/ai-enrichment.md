# AI Enrichment

## 1. 配置与密钥

compiler 专用变量：

```text
LEXICON_AI_API_KEY=<secret>
LEXICON_AI_BASE_URL=https://api.deepseek.com
LEXICON_AI_STRICT_BASE_URL=https://api.deepseek.com/beta
LEXICON_AI_MODEL=<validated-model-id>
LEXICON_AI_THINKING=disabled
LEXICON_AI_BUDGET_USD=<explicit decimal>
LEXICON_AI_CONCURRENCY=<1..32; pilot starts low>
LEXICON_AI_INPUT_USD_PER_MILLION=<pricing snapshot>
LEXICON_AI_OUTPUT_USD_PER_MILLION=<pricing snapshot>
LEXICON_AI_CACHE_HIT_USD_PER_MILLION=<optional pricing snapshot>
LEXICON_AI_CACHE_KEY=<32-byte hex-or-base64 secret>
LEXICON_AI_MAX_ATTEMPTS=5
LEXICON_AI_RETRY_BASE_MS=500
LEXICON_AI_RETRY_MAX_MS=30000
```

runtime Worker key、Compiler Runner enrichment key、本地 pilot key、staging key 和 production key 分开。`LEXICON_AI_CACHE_KEY` 只加密本次 build 的本地 candidate cache，不复用 runtime、数据库或 session 加密 key。key 只存在本地 ignored env 或拥有 adapter 的 Railway sealed variable；GitHub protected environment 只持 build authorization/publish credential，不持长期 AI key。任何 key 都不进入 manifest、candidate、日志、JSON 或文档。

DeepSeek adapter 的默认基础地址为 `https://api.deepseek.com`；model capability 和价格会变化，因此部署配置必须在 run 前 probe，每次正式 run 将实际 model、provider revision 和 pricing snapshot 写入 metadata，而不是在领域 enum 或代码中固定型号。[DeepSeek API](https://api-docs.deepseek.com/)

Compiler 从 public API 注入 `StructuredGenerationPort`，业务 pipeline 不 import DeepSeek SDK。CLI composition root 才读取上述变量并创建 `packages/ai-provider` adapter；测试注入 fake port。Compiler 不需要流式端口。

## 2. 任务拆分

AI 不一次返回“完整单词大 JSON”。任务固定为：

| taskType                            | 输入 target                                            | 允许输出                                                                            |
| ----------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `SENSE_ALIGNMENT`                   | 一个 Entry + source senses                             | source-to-canonical mapping、split/merge candidate、理由                            |
| `LEARNER_DEFINITION`                | 一个 Sense + evidence                                  | 英文学习定义、中文学习翻译 candidate                                                |
| `EXAMPLE_GENERATION`                | 一个 Sense                                             | 明确标记 GENERATED 的双语教学例句                                                   |
| `COLLOCATION_ENRICHMENT`            | 一个 Sense                                             | 搭配 candidate + target sense evidence                                              |
| `SYNSEM_FRAME`                      | 一个 Sense/Entry                                       | frame、syntactic args、predicate、semantic args、mapping                            |
| `RELATION_RESOLUTION`               | source relation text + candidate targets               | typed target choice 或 unresolved                                                   |
| `STUDY_HINT`                        | 一个 ObjectiveRevision                                 | 答题时使用的短提示，标记 GENERATED；不承载大段讲解                                  |
| `PEDAGOGICAL_MATERIAL_GENERATION`   | 一个 typed lexical/Objective target + material kind    | 结构化教学材料 revision、targets、blocks、mentions、citation refs candidates        |
| `PEDAGOGICAL_MATERIAL_VERIFICATION` | 一个完整 PedagogicalMaterialRevision candidate         | 事实边界、义项绑定、双语一致性、mention、引用、长度和安全 verdict                   |
| `EXERCISE_GENERATION`               | 一个 ObjectiveRevision + task profile + candidate pool | task/evidence/response profile、题干、答案、干扰项类型、反馈和建议 validation level |
| `EXERCISE_VERIFICATION`             | 一道 ExerciseRevision                                  | answerability、ambiguity、distractor correctness/plausibility/diversity verdict     |

每个 task 只处理一个明确 primary target。题目任务只处理一个 Objective subject；教学材料任务只处理一个 Entry/Sense/Form/Morpheme/WordFormation/Collocation/Objective target，避免内容回退到首义项或混合多个词性。

## 3. Candidate-local ID

AI 不能分配正式 UUID。响应中新增 node 使用 local ID：

```json
{
  "schemaVersion": "sylis.ai-candidate/1",
  "taskType": "EXERCISE_GENERATION",
  "target": {
    "kind": "EXISTING",
    "releaseBuildId": "build_local",
    "learningObjectiveRevisionId": "objective_revision_helpful_receptive_v1"
  },
  "payload": {
    "nodes": [
      {
        "localId": "exercise:1",
        "nodeType": "EXERCISE_REVISION",
        "exerciseTaskKind": "FORM_MEANING_MAPPING",
        "evidenceKind": "RECOGNITION",
        "responseKind": "CHOICE",
        "responseCardinality": "SINGLE",
        "responsePlacement": "BLOCK",
        "gradingMode": "EXACT",
        "validationLevel": "FORMATIVE_VERIFIED"
      }
    ]
  }
}
```

promotion 使用 `CandidatePromotionMap(candidateId, localId, entityType, finalId)`；重试必须复用 mapping。

## 4. Structured output

普通 JSON Output 只保证 JSON 语法且可能返回空内容，不能替代 schema 校验。[DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)

正式 candidate 使用 strict tool mode：

- base URL 为 `/beta`；
- 每个 function 设置 `strict: true`；
- 每个 object 的全部 properties 都列入 `required`；
- `additionalProperties: false`；
- 只使用 DeepSeek 当前支持的 schema subset；
- 启动时执行最小 probe，失败则停止新 candidate 生成。

无论 strict 是否成功，响应都再次通过本地 JSON Schema/Zod、长度、枚举、candidate reference 和业务验证。[DeepSeek strict tool calls](https://api-docs.deepseek.com/guides/tool_calls)

## 5. 事实边界

### AI 可以正式贡献

- 教学定义和翻译（明确 GENERATED/DERIVED）；
- 教学例句；
- 搭配、frame 和关系解析 candidate，经来源/规则验证后 promotion；
- 学习提示、PedagogicalMaterial、题目、干扰项和反馈。

### AI 不可无来源贡献

- IPA 或真实音频；
- “来自 CET/考研某年真题”的 citation；
- corpus count/rank；
- 历史词源、重建形式；
- “这是官方 CEFR B1 单词”的 claim；
- source license/rights。

模型内部知识不是 evidence。

## 6. PedagogicalMaterial 生成规则

[DictionaryByGPT4](https://github.com/Ceelog/DictionaryByGPT4) 只作为内容维度和人工评价参考。其 `gptwords.json` 使用 `word + content` 的扁平 NDJSON，不作为 compiler source，也不复制进 artifact。Sylis 将通俗解释、构词讲解、文化背景、助记和微故事保存为结构化、可引用、可验证的 PedagogicalMaterial。

| `materialKind`           | 输入事实与硬门禁                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `LEARNER_EXPLANATION`    | 精确 Sense definition/translation/usage/nearby senses；不能混合 Entry 的其他义项                     |
| `MORPHOLOGY_WALKTHROUGH` | 只引用正式 Morpheme、segment、inflection 和 WordFormation；无 graph 时 NOT_APPLICABLE                |
| `CULTURAL_CONTEXT`       | 每个事实 block 必须引用 source-backed ContentEvidence；AI 只能组织和重述                             |
| `MNEMONIC`               | 可创作但必须标记 GENERATED；不得把谐音、联想或拆字宣称为真实词源                                     |
| `MICRO_STORY`            | 绑定精确 Sense/Objective；学习语言原文和支持语言译文分 block；目标 Form/Sense 用 offset mention 标注 |

生成只返回 candidate-local IDs 和 typed blocks，不返回 Markdown 文章。共同校验顺序：target/release 引用、语言与长度、事实 claim、citation closure、mention offset、重复/近重复、安全、双语一致性和 material-kind 专属规则。

分层 coverage 固定为：

1. 每个 `STUDY_READY` Sense 必须生成或复用 `LEARNER_EXPLANATION`。
2. `MORPHOLOGY_WALKTHROUGH` 和 `CULTURAL_CONTEXT` 仅在正式证据满足资格时计划。
3. `MNEMONIC` 和 `MICRO_STORY` 只对 source manifest 中版本化且带 checksum 的 `richTargetSet` 计划；没有该 target set 时正式 full run 在 PREFLIGHT 失败。
4. `fixture` 与 `pilot-200` 覆盖五种 kind、PRESENT/NOT_APPLICABLE/REJECTED 和多义词/同形词场景；full run 必须先通过预算预测和人工抽样。
5. Material verifier 可以发现问题但不能把 candidate 自己的文本变成词典 provenance；失败项保留 REJECTED，不用空文案补齐 coverage。

## 7. Exercise 生成规则

1. 先确定 ObjectiveRevision 的唯一 subject、`knowledgeFacet` 和 `retrievalDirection`，再从版本化允许矩阵选择 `exerciseTaskKind + evidenceKind + responseKind + responseCardinality + responsePlacement + gradingMode`；response profile 不是学习目标。
2. 只使用被引用的正式定义、翻译、Form、例句、搭配和 Frame 作为作答依据；需要语境时生成或引用 Stimulus candidate。
3. 先生成 typed correct response 和合法 aliases，再生成 prompt；不能先写题干后猜答案。
4. 从正式 lexicon candidate pool 选干扰项，先按语言、POS、形态槽位、学习范围和 target level 过滤，再按相近频率/长度和明确的常见混淆排序。
5. 每个干扰项输出 `distractorKind`、内部 rationale、target reference 和在完整语境中为何错误；rationale 供 validator 使用，不必公开。
6. 同时生成 outcome/choice-specific corrective feedback 和 `authoredDifficultyTier`；它只是受控创作分层，不是 IRT/calibration 结果。
7. 自动检查答案唯一、选项互异、无同义正确答案、语境可解、无语法/长度/格式泄题。
8. 独立 verifier 检查错误性、合理性、语境适配和多样性；生成器 confidence 不作为通过依据。
9. 若已有等价 source-backed exercise，通过 semantic signature 复用，AI 不重复生成。
10. 题目只作为 candidate；发布后不可变，prompt/stimulus/答案/干扰项任一实质变化都创建新 ExerciseRevision。
11. AI 建议的 `validationLevel` 不是发布凭证；本地门禁强制 `SELF_REPORT`、`AI_ASSISTED`、`EXTENDED_TEXT` 和开放翻译/造句只能进入 `PRACTICE_ONLY`。
12. 通过验证的 `MICRO_STORY` 作为 `StimulusBlock(MATERIAL)` 引用 immutable material revision，并绑定同一 Sense Objective 的 `SENTENCE_PRODUCTION`；不得复制 story blocks 到 stimulus。精确 Objective/Exercise 不存在时 rich target 构建失败。

有道/source exercise、确定性 lexicon template 和 AI 生成统一进入 `EXERCISE_CANDIDATE` schema。答案由正式 lexical subject/accepted response 支撑；生成模型不得既创造答案事实又充当唯一 verifier。通过后的 Objective、Stimulus、Exercise 和 Blueprint 全部写入同一个 artifact，importer 不再调用 AI。

## 8. Candidate、BuildRun 与执行状态

每个 AI task 都先创建不可变输入快照和 candidate identity；执行状态只由关联 BackgroundJob/Compiler checkpoint 持有。Candidate 自身只表达内容审核生命周期：

```text
PLANNED -> GENERATED -> AUTO_VALIDATED -> REVIEW_PENDING -> APPROVED -> PROMOTED
             |              |                  |            |
             v              v                  v            v
          REJECTED       REJECTED           REJECTED      SUPERSEDED
```

- `GENERATED` 只表示 provider 返回完成，不代表内容正确。
- 低风险且所有自动规则通过的 candidate 可由 policy 从 `AUTO_VALIDATED` 直接进入 `APPROVED`；中高风险、抽样命中和任何 conflict 进入 `REVIEW_PENDING`。
- `PROMOTED` 必须记录 final entity ID、evidence、validator/policy version 和批准 actor；promotion 后 candidate 不再修改。
- retry 创建新的 invocation attempt，但复用同一 candidate key；只有一个 attempt 可成为 accepted response。
- `FAILED/REJECTED/SUPERSEDED` 都保留 machine-readable reason code，不进入 artifact 正式数组。

BuildRun 只保存审批与制品生命周期：

```text
PROPOSED -> BUDGET_APPROVAL_PENDING -> APPROVED -> ARTIFACT_PUBLISHED
    |                    |                     |
    +--------------------+-----------------> REJECTED
```

每个执行 attempt 由 `BuildRun.jobId` 唯一关联的 `BackgroundJob` 表达；PREFLIGHT、PILOT、RUNNING、VALIDATING 等是 `JobProgressEvent.stage`，不是第二套状态机。预算不足时 Job 进入 `PAUSED/BUDGET_APPROVAL_REQUIRED`；追加预算产生新的 append-only approval/reservation，再通过 resume command 重新排队并从 checkpoint 恢复。只有 Job `SUCCEEDED` 且 artifact 回读、global validation 和双 hash 都完成，BuildRun 才能进入 `ARTIFACT_PUBLISHED`。

## 9. 重试、限流和缓存

- candidate key = task type + target identity + input evidence hash + prompt/schema/model version。
- 429/5xx 使用带 jitter 的指数退避并尊重 provider response；schema/semantic 错误不做无上限重试。
- `LEXICON_AI_CONCURRENCY` 是本次 run 的显式上限（1-32），不是 provider account 上限的复制；pilot 从低并发开始，按 latency/429/预算调节。可独立生成的候选并发调用 provider，结果按稳定 task 顺序写回 artifact；同一 target 内有依赖的 generation -> verification 保持顺序。[DeepSeek rate limit](https://api-docs.deepseek.com/quick_start/rate_limit/)
- 完整合规响应按 candidate key 加密/受限缓存，避免 retry 重复收费。
- 每次 cache miss 在 provider 调用前按受限输入 bytes、provider envelope allowance 和 `maxTokens` 保守预留预算，完成后以 provider usage 结算，失败释放预留；并发 reservation 后超过 hard budget 的任务不得发出。费用记录 pricing snapshot，达到 hard budget 立即停止新任务。
- 加密 candidate cache 允许并发读取，但本地 envelope 通过串行原子 rename 写入，不能让并发任务互相覆盖或丢失已付费响应。
- pilot 完成后按 task mix、cache miss、重试和 p95 token 计算全量预测；默认 hard cap 为预测值 125% 与 `LEXICON_AI_BUDGET_USD` 中的较低值。
- full run 必须引用 `BudgetApproval { runId, approvedUsd, forecastHash, actor, approvedAt }`；不能靠环境变量存在就自动获批。
- reservation 使用 decimal money + pricing snapshot；并发 worker 通过原子 ledger reservation 防止总额竞态超支。

## 10. 质量门禁

每个 candidate 依次通过：

1. provider response 完整性（finish reason、空内容、token truncation）；
2. strict/local schema；
3. language/vocabulary/length；
4. local/existing reference resolution；
5. task-specific semantic rule；
6. duplicate/conflict；
7. source and rights；
8. content safety；
9. calibrated sampling/manual review policy。

任何失败保留 issue 和 candidate status，不写正式 artifact section。

## 11. Prompt 与审计

记录 `provider`, `model`, `promptTemplateVersion`, `schemaVersion`, input evidence hashes, token usage, cost 和 validator versions。默认不把受限 source 原文或完整 chain-of-thought 放入可公开 artifact；prompt 审计存受限构建存储。
