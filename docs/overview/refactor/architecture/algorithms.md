# 算法注册表与版本策略

## 1. 总则

每个影响用户内容、顺序、评分或发布的算法都必须有稳定名称、版本、输入契约、确定性边界、失败策略和观测指标。数据库保存算法版本与必要输入快照，不能只保存最终分数。

AI 模型不是算法真相。模型可以生成候选或辅助反馈，但正式 identity、correctness、release eligibility 和记忆更新由版本化程序规则决定。

## 2. 注册表

| Algorithm                | Owner               | 主要输入                                        | 输出                                       | 失败策略                            |
| ------------------------ | ------------------- | ----------------------------------------------- | ------------------------------------------ | ----------------------------------- |
| `lexical-identity/v1`    | Lexicon Compiler    | normalized source candidates + evidence         | Headword/Entry/Form/Sense/Concept proposal | 冲突进入 `UNRESOLVED`，不自动合并   |
| `lexicon-search/v1`      | Lexicon API         | release、query、language、filters、cursor       | ranked typed matches + reason              | 返回空分区，不调用 AI               |
| `fsrs-objective/v1`      | Learning            | MemoryState + ReviewEvent rating/time           | next state + due                           | 事务回滚，保留前态                  |
| `study-selection/v1`     | Learning            | due objectives、coverage、history、capability   | ordered plan items + selection trace       | 无合格 Exercise 时返回明确缺口      |
| `exercise-scoring/v1`    | Learning            | revision、presented choices、typed response     | outcome、score、feedback eligibility       | 422，不做宽松猜测                   |
| `assessment-assembly/v1` | Assessment          | blueprint revision、eligible bank、seed         | fixed session items                        | blueprint unsatisfied，禁止静默缩水 |
| `reading-targets/v1`     | Reading             | document annotations + due objectives           | bounded ReadingTargets                     | 保留文档，目标列表为空              |
| `content-relevance/v1`   | Reading             | source order、filters、target coverage、history | source-specific ordered candidates         | 回退来源原始顺序                    |
| `ai-publication-gate/v1` | Compiler/Admin      | candidate、evidence、validators、risk policy    | publish/review/reject decision             | 任一 ERROR 阻断 batch               |
| `ai-budget/v1`           | AI Tutor/Compiler   | quota、ledger、pilot forecast、idempotency key  | allow/reserve/settle/pause                 | 超额前拒绝或暂停，不透支            |
| `import-progress/v1`     | Platform Operations | bytes/rows/checkpoints/stage timestamps         | progress、rate、ETA、warnings              | ETA 可为空，已确认计数不可倒退      |

## 3. Lexical identity resolution

处理顺序固定为 Unicode NFC 展示值、独立 search key、语言、lemma、POS、同形词/词源证据、外部 Sense/Concept ID 和来源记录。NFKC、casefold 或去重音符只能生成 search key，不能覆盖展示身份；Unicode 明确指出 compatibility normalization 可能移除语义差异。[Unicode Normalization](https://www.unicode.org/reports/tr15/)

Form 与独立 Entry 使用四态结论：

| Decision           | 条件                                          | 结果                      |
| ------------------ | --------------------------------------------- | ------------------------- |
| `INFLECTED_ONLY`   | 有可靠 form-of/inflection，缺独立 POS + Sense | 只建父 Entry 下 Form      |
| `INDEPENDENT_ONLY` | 有独立 POS + Sense，缺可靠 form-of            | 只建独立 Entry            |
| `BOTH`             | 两组证据都成立                                | 同时建 Form 与 Entry      |
| `UNRESOLVED`       | 来源冲突或证据不足                            | 建 QA issue，不 promotion |

外部 synset/ILI、Wiktionary identity 和明确 source mapping 是自动对齐强证据。gloss 相似度、embedding 和 LLM 只能创建 match proposal；禁止单独触发 Sense merge/split。

## 4. Search ranking

搜索使用分层排序而不是难以解释的单一魔法分数：

1. 同语言 exact Headword/Entry lemma；
2. exact Form、multiword Entry、collocation；
3. exact alias、translation 或 normalized search key；
4. prefix match；
5. PostgreSQL trigram/全文候选。

同一层依次按学习核心 profile、来源质量、频率 rank、稳定 ID 排序。每条结果返回 `matchKind`、matched text、target kind 和 target ID；Form 命中必须同时返回所属 Entry。cursor 固定 `releaseId + queryProfileVersion + sort tuple` 并签名。

## 5. FSRS 与每日计划

FSRS 只处理一个 User 对一个 LearningObjective 的 difficulty、stability、retrievability 和 due。适配器把 MemoryState 转换为库内部类型；库内部 `Card` 不进入领域、API 或数据库。[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)

`study-selection/v1` 先建立 eligibility：同 release、PUBLISHED、当前 capability 可渲染、validationLevel 可用于学习、未被撤回。候选按以下稳定 tuple 排序：

1. 已逾期 Objective 优先于未到期和新 Objective；
2. 同组按更低 retrievability、更多 coverage 缺口优先；
3. 对最近使用的 ExerciseRevision、task 和 stimulus 施加 cooldown；
4. 对高 exposure Exercise 降低优先级；
5. 使用 `userId + planDate + policyVersion` 的确定性 seed 打破并列。

一个 Exercise 只更新 primary Objective。secondary subjects 只进入诊断统计，Assessment Attempt 永远不创建 ReviewEvent。

## 6. Scoring 与 assessment

- `CHOICE` response 只比较 revision 内 stable choice ID 集合；SINGLE/MULTIPLE cardinality 决定集合约束。
- `SHORT_TEXT` 使用语言感知 normalization 与受控 accepted response；不得用任意编辑距离把错误猜成正确，INLINE 只改变呈现位置。
- `EXTENDED_TEXT`、`SELF_REPORT`、`AI_ASSISTED`、开放翻译和自由造句只能 `PRACTICE_ONLY`。
- `NO_CAPTURE` 只允许 reveal 后 `SELF_REPORT`，不创建文本/音频响应，也不调用 ASR 或自动发音评分；`SPOKEN_FORM_PRODUCTION` 必须有可靠发音 stimulus。
- Session assembly 依 blueprint 的 facet/direction/evidence/task/response/validation quotas 无放回抽样，固定 seed、release、algorithm version 和 choice order。
- 题库不足返回 `BLUEPRINT_UNSATISFIED` 与缺口报告，不临时请求 AI 或减少题量。

  0.0.1 不注册题目统计、校准、IRT、CAT、用户能力估计或词汇量估算算法。Artifact 可以携带来源明确的 ProficiencyClaim，但算法不得把题目表现推导成 CEFR 结论。未来若积累到预先登记的 population、样本、拟合、局部独立和 DIF 门禁，必须另立 ADR 和新算法版本；现有 Attempt 事实足以作为未来输入。[ETS IRT](https://www.ets.org/Media/Research/pdf/RM-20-06.pdf)

## 7. Reading targets 与内容排序

ReadingTarget 候选必须同时存在于固定 DocumentRevision annotation 和当前 User 的 Objective 集合。按 overdue/retrievability、正文覆盖、近期重复和句段分布排序；默认 short/medium/long 文档最多选择 3/5/8 个 primary targets，同一句最多一个 primary target，policy version 可调整。

每个 ContentExperience 保留自己的来源顺序和过滤器。可选学习相关 rerank 只在来源候选集内进行，特征限于目标覆盖、已读/收藏状态、难度适配和新颖度；响应必须返回 `rankingReason`，关闭个性化时完全回退来源顺序。

## 8. AI publication 与预算

发布门禁固定为：schema -> reference closure -> lexical evidence -> answer uniqueness -> distractor collision -> duplicate/toxicity/language checks -> risk classification -> automated publish 或 human review。AI judge 不能成为唯一 verifier；抽检失败率超过 batch policy 阈值时阻断整个 batch。

Compiler 全量运行前必须完成 200 lemma pilot。成本预测包含输入/输出 token、缓存命中、验证失败和重试分位数；Admin 明确批准 run budget，80% 发告警，100% 令 BackgroundJob 进入 `PAUSED` 并写 `pauseReasonCode=BUDGET_APPROVAL_REQUIRED`，追加预算后以授权 command 重新排队并从 checkpoint 恢复。

在线调用先以 `user + capability + window` 检查用户额度，再检查系统额度和并发；预留后调用 provider，按实际用量结算。幂等键命中只能复用相同 input hash、prompt version 和 model，不重复扣费。

## 9. Progress 与版本升级

Import progress 使用实际 bytes/records/rows，不给 stage 配虚假百分比。吞吐量采用最近完成 chunk 的指数移动平均；没有稳定样本时 ETA 为 `null`。checkpoint 保存 source offset、last stable key、stage 和 artifact hash；恢复时任何输入不一致都拒绝继续。

算法升级必须新增版本、用 golden event/fixture 重放、生成行为 diff，并明确是否迁移快照。禁止在原版本下更改权重、阈值、normalization 或随机种子规则。
