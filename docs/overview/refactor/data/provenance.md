# 来源、证据与权利

## 1. 三层模型

```text
raw source record
  -> typed normalized candidate
    -> promoted release fact + ContentProvenance
```

raw 层忠实保存来源；candidate 层允许冲突、缺失和 unresolved target；正式层只保存通过验证且能引用正式 ID 的事实。

## 2. 来源职责矩阵

| 来源               | 主要贡献                                                                                                               | promotion 限制                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ECDICT             | headword candidate、中英文本、POS、exchange、frequency/tag、考试词表 membership                                        | `exchange` 只生成 Form/FormFeature；tag 只生成 book evidence；扁平 translation 需 Sense 对齐                                                                    |
| Kaikki/Wiktextract | Entry/POS、forms、form-of、senses、examples、pronunciation、relations、etymology candidate                             | Wiktionary 结构仍需版本固定、tag 映射和质量过滤；form-of 是关键证据但不是绝对规则                                                                               |
| OEWN               | synset、definition、Sense membership、Concept relations、external IDs                                                  | 只覆盖 WordNet 范围；不能替代学习翻译、搭配或所有词性内容                                                                                                       |
| 有道制品           | 中文释义、音标/音频、例句/真题、搭配、同反义候选、词族、来源文化说明、助记、exercise candidate、81 本书原始 membership | 不按数组 index 对齐 Sense；source text target 未解析前不建 relation；文化说明逐 block 引用直接来源 evidence；同一内容跨书去重事实但保留全部 membership evidence |
| DeepSeek           | Sense alignment、学习定义/翻译、教学例句、搭配、Frame、关系解析、短提示、PedagogicalMaterial、exercise 和干扰项候选    | 不生成无来源 IPA、真题引用、频率、词源、文化事实或 corpus fact；永不直接写正式表                                                                                |

## 3. Evidence graph

`ContentProvenance` 是一个内容 bundle；`ContentEvidence` 允许：

- `DIRECT`：正式文本或关系直接来自 SourceRecord。
- `DERIVED`：确定性转换，如 ECDICT exchange 映射 Form。
- `SUPPORTING`：另一来源支持 AI alignment 或 relation resolution。
- `CONTRADICTING`：保留冲突，供验证和人工决策。
- `GENERATED`：由明确 generator run 产生的教学内容。

一个 fact 可以有多条 evidence。相同正式内容来自有道多本书时不复制定义/例句，只追加对应 SourceRecord evidence 和各自 BookItem membership。

## 4. 去重键

| 对象                | 语义去重键                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| SourceRecord        | `datasetVersionId + sourceKey`                                                                                   |
| Headword candidate  | canonical language + NFC identity text                                                                           |
| Entry candidate     | Headword identity + POS + morphology/etymology evidence cluster                                                  |
| Form                | Entry + normalized representation + sorted feature set                                                           |
| Sense               | Entry + semantic signature；禁止只用 source order                                                                |
| Example             | release + language + normalized sentence hash                                                                    |
| PedagogicalMaterial | material kind + audience profile + primary target + normalized typed blocks + mentions                           |
| Exercise            | response profile + stable learning target + normalized prompt + normalized correct response；choice order 不参与 |

去重不等于覆盖。冲突值都保留 candidate/evidence，正式选择记录 resolver version 和 decision reason。

## 5. 有道复用策略

1. 原始有道 export 由 compiler adapter 逐条读取，不先写旧 `Word` 表。
2. `exam`, `realExamSentence` 和练习字段分别解析为 citation/example/exercise candidate。
3. 能解析到具体 Sense/Form/Collocation/Frame 且答案唯一的 source-backed exercise 可复用。
4. 只有 Word 级 target、位置答案、重复/含糊选项或缺失出处的内容留在 candidate，等待修复。
5. 旧 `WordPracticeQuestion` 中通过同样门禁的 source-backed 题可作为一次性 migration input；旧 AI 题重新生成。
6. 旧 `QuizQuestion` 没有稳定题干、revision、provenance 和精确 target，不作为正式迁移来源。

## 6. 权利和导出策略

每个 `SourceRightsPolicy` 分开定义：

- `mayBuild`: 是否可用于内部构建；
- `mayServe`: 是否可经 API 展示；
- `mayExport`: 是否可进入公开标准 JSON；
- `requiresAttribution`: attribution 要求；
- `effectiveFrom/effectiveTo`: 生效窗口；
- `policyVersion`: 政策版本。

即使业务决定公开所有来源，技术上仍保留这组字段。它让未来授权变化可以构建新 release，而无需猜哪些行受影响。

当前 `sylis.lexicon-artifact/1` 是公开交换和线上 serving 的同一个发布边界，因此其 source manifest 必须显式声明 rights，且 `mayBuild/mayServe/mayExport` 全为 true。任一 false 都阻止 compiler 和 streaming validator 成功，不能仅将 `rawPayload` 改为 URI 后继续公开派生定义、例句或题目。未来的 candidate-only/internal build 若确有需要，必须拥有不同 profile、不可公开输出和单独 ADR。

DictionaryByGPT4 仅作为产品内容维度和人工评价参考，不登记为 `SourceDatasetVersion`，也不复制其现成 NDJSON。若未来改变这一决定，必须先新增 source manifest、rights policy、adapter 和逐条 provenance；不能把参考链接当成可发布 evidence。

## 7. 撤回流程

1. 创建 `SourceRestrictionEvent`，不得直接删除 active facts。
2. 沿 `ContentEvidence -> ContentProvenance -> facts/objectives/exercises/releases` 计算影响集。
3. 阻止包含受限唯一证据的新 release 激活。
4. 构建排除/替代这些事实的新 release。
5. 验证、激活，再按政策处理旧 release serving/export restriction。
6. 所有操作有 actor、reason、timestamp 和 old/new release 审计。

## 8. 来源更新

来源更新只创建新的 `SourceDatasetVersion`。相同 checksum 不重复构建；不同 checksum 生成新的 candidates 和 release diff。不得在 API 部署、容器重启或 GET 请求时自动拉取“最新版”并更新 active 数据。
