# Artifact 与数据库映射

## 1. 映射原则

`sylis-lexicon-v1.json.zst` 解压后的单一 JSON object 只描述一个完整内容 release。PostgreSQL 同时保存跨 release 的稳定 identity、该 release 的不可变 revision、运行时用户事实和构建运维事实，因此不是每张表都应出现在 artifact。

映射分四类：

- **DIRECT**：一个 artifact row 写一张 release-scoped 表。
- **IDENTITY + REVISION**：稳定数组和 revision 数组分别写两张表。
- **SPLIT**：artifact discriminated union 按 target/type 写多张强外键表。
- **NOT IN ARTIFACT**：用户、会话、activation、candidate 和运行日志由线上/构建系统产生。

manifest 是 release 元数据的唯一来源；`lexicon` bundle 不再重复放一个 `release` object。

## 2. Manifest、受控词表和来源

| Artifact 路径                                          | PostgreSQL                                                  | 类型                       | 规则                                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------ |
| `manifest.lexiconKey/sourceLanguageTag`                | `Lexicon`                                                   | identity upsert            | key/language 不一致拒绝导入                                                                |
| `manifest.releaseVersion/contentHash/canonicalization` | `LexiconRelease`                                            | build metadata             | importer 创建 DRAFT；artifact 不提供 DB status/id/time                                     |
| `manifest.builder/build/inputs/ai`                     | `LexiconReleaseBuildMetadata` + `LexiconReleaseSourceInput` | immutable build provenance | requested/resolved AI identity 分开；source input 必须解析到同 artifact 的 dataset version |
| `manifest.textProfile`                                 | `TextProcessingProfile`                                     | immutable value            | 按 content hash 复用                                                                       |
| `manifest.learningLanguageTags`                        | `LexiconReleaseLearningLanguage`                            | DIRECT                     | release 内唯一；保留 manifest 顺序                                                         |
| `vocabularies.bundles`                                 | `VocabularyBundle`                                          | DIRECT                     | release 固定一个 bundle                                                                    |
| `vocabularies.namespaceVersions`                       | `VocabularyNamespaceVersion`                                | DIRECT                     | URI + version + checksum 精确固定                                                          |
| `vocabularies.terms`                                   | `VocabularyTerm`                                            | DIRECT                     | 所有语言学 code 解析到 bundle 内 term                                                      |
| `sources.datasets`                                     | `SourceDataset`                                             | identity upsert            | stable source key                                                                          |
| `sources.datasetVersions`                              | `SourceDatasetVersion`                                      | DIRECT                     | version/URI/checksum/rights immutable                                                      |
| `sources.records`                                      | `SourceRecord`                                              | DIRECT                     | raw content 可只保存 hash +受控 URI；不强制嵌入受限全文                                    |
| `sources.rightsPolicies`                               | `SourceRightsPolicy`                                        | DIRECT                     | build/serve/export policy                                                                  |
| `sources.restrictions`                                 | `SourceRestrictionEvent`                                    | DIRECT                     | artifact 记录 build 时有效快照/事件                                                        |
| `provenance.bundles`                                   | `ContentProvenance`                                         | DIRECT                     | 正式 fact 只能引用存在 bundle                                                              |
| `provenance.evidence`                                  | `ContentEvidence`                                           | SPLIT/XOR                  | target 是 sourceRecord 或 upstreamProvenance，恰好一个                                     |

`ProcessingRun`、`Candidate` 和模型 response cache 不放入公开 artifact；manifest 只保存可复现所需的 builder/model/schema/version 摘要。

## 3. 词典主轴

| Artifact 数组                     | PostgreSQL                                   | 类型                                                |
| --------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| `lexicon.headwords`               | `Headword`                                   | stable identity                                     |
| `lexicon.headwordRevisions`       | `HeadwordRevision`                           | release revision                                    |
| `lexicon.entries`                 | `LexicalEntry`                               | stable identity                                     |
| `lexicon.entryRevisions`          | `LexicalEntryRevision`                       | release revision                                    |
| `lexicon.forms`                   | `LexicalForm`                                | DIRECT                                              |
| `lexicon.formRepresentations`     | `FormRepresentation`                         | DIRECT                                              |
| `lexicon.formFeatures`            | `FormFeature`                                | DIRECT                                              |
| `lexicon.mediaAssets`             | `MediaAsset`                                 | DIRECT                                              |
| `lexicon.formMedia`               | `FormMedia`                                  | DIRECT                                              |
| `lexicon.senses`                  | `LexicalSense`                               | stable identity                                     |
| `lexicon.senseRevisions`          | `LexicalSenseRevision`                       | release revision                                    |
| `lexicon.definitions`             | `SenseDefinition`                            | DIRECT                                              |
| `lexicon.translationTexts`        | `SenseTranslationText`                       | DIRECT                                              |
| `lexicon.translationRelations`    | `SenseTranslationRelation`                   | DIRECT/two-sided release FK                         |
| `lexicon.usages`                  | `SenseUsage`                                 | DIRECT                                              |
| `lexicon.concepts`                | `LexicalConcept`                             | stable identity                                     |
| `lexicon.conceptRevisions`        | `LexicalConceptRevision`                     | release revision                                    |
| `lexicon.conceptDefinitions`      | `ConceptDefinition`                          | DIRECT                                              |
| `lexicon.senseConceptMemberships` | `SenseConceptMembership`                     | DIRECT                                              |
| `lexicon.externalIdentifiers`     | typed Entry/Sense/Concept external ID tables | SPLIT by `ownerKind`                                |
| `lexicon.entryLineages`           | `EntryLineage`                               | DIRECT；effective release + source/target stable ID |
| `lexicon.senseLineages`           | `SenseLineage`                               | DIRECT；effective release + source/target stable ID |
| `lexicon.conceptLineages`         | `ConceptLineage`                             | DIRECT；effective release + source/target stable ID |

一个 artifact 内每个 `artifactRole=CURRENT` 的 stable Headword/Entry/Sense/Concept 必须恰好有一个对应 revision；`LINEAGE_ANCHOR` 必须被 lineage 使用且可以没有 revision。stable row 只含稳定身份字段，显示文本、POS、parent、顺序和 status 只在 revision row。Artifact 内任何 row 都不携带数据库 `releaseId`；Importer 创建 `LexiconRelease` 后把该 ID 注入所有 release-scoped staging/正式行。这样不会把跨 release identity、artifact local reference 与数据库身份混在一个对象里。

## 4. 内容与关系

| Artifact 数组                   | PostgreSQL             | 类型   |
| ------------------------------- | ---------------------- | ------ |
| `lexicon.entryRelations`        | `EntryRelation`        | DIRECT |
| `lexicon.senseRelations`        | `SenseRelation`        | DIRECT |
| `lexicon.conceptRelations`      | `ConceptRelation`      | DIRECT |
| `lexicon.examples`              | `ExampleSentence`      | DIRECT |
| `lexicon.exampleTranslations`   | `ExampleTranslation`   | DIRECT |
| `lexicon.senseExamples`         | `SenseExample`         | DIRECT |
| `lexicon.citations`             | `ExampleCitation`      | DIRECT |
| `lexicon.collocations`          | `Collocation`          | DIRECT |
| `lexicon.senseCollocations`     | `SenseCollocation`     | DIRECT |
| `lexicon.collocationComponents` | `CollocationComponent` | DIRECT |

relation 的 level 由数组决定，不能由 importer 猜测。artifact validator 在连接数据库前就拒绝把 hypernym 放入 Sense relation、把 inflection 放入 Entry relation或把 synonym 挂 Headword。

## 5. SynSem、形态、词源和语料

| Artifact 路径                                  | PostgreSQL                            | 类型                         |
| ---------------------------------------------- | ------------------------------------- | ---------------------------- |
| `lexicon.frames`                               | `SyntacticFrame`                      | DIRECT                       |
| `lexicon.syntacticArguments`                   | `SyntacticArgument`                   | DIRECT                       |
| `lexicon.predicates`                           | `SemanticPredicate`                   | DIRECT                       |
| `lexicon.semanticArguments`                    | `SemanticArgument`                    | DIRECT                       |
| `lexicon.senseFrames`                          | `SenseFrame`                          | DIRECT                       |
| `lexicon.argumentMappings`                     | `ArgumentMapping`                     | DIRECT                       |
| `lexicon.morphology.morphs`                    | `Morph`                               | stable identity              |
| `lexicon.morphology.morphemes`                 | `Morpheme`                            | stable identity              |
| `lexicon.morphology.analyses`                  | `MorphologicalAnalysis`               | DIRECT                       |
| `lexicon.morphology.segments`                  | `MorphologicalSegment`                | DIRECT                       |
| `lexicon.morphology.inflectionRules`           | `InflectionRule` + version            | identity/revision projection |
| `lexicon.morphology.inflectionGenerations`     | `InflectionGeneration`                | DIRECT                       |
| `lexicon.morphology.wordFormations`            | `WordFormation`                       | DIRECT                       |
| `lexicon.morphology.wordFormationInputs`       | `WordFormationInput`                  | SPLIT/XOR Entry or Morpheme  |
| `lexicon.morphology.wordFormationRules`        | `WordFormationRule` + version         | identity/revision projection |
| `lexicon.morphology.wordFormationApplications` | `WordFormationApplication`            | DIRECT                       |
| `lexicon.etymology.hypotheses`                 | `EtymologyHypothesis`                 | DIRECT                       |
| `lexicon.etymology.links`                      | `EtymologyLink` typed endpoint tables | SPLIT                        |
| `lexicon.etymology.etymons`                    | `Etymon`                              | stable identity              |
| `lexicon.etymology.etymonRevisions`            | `EtymonRevision`                      | release revision             |
| `lexicon.corpora.datasets`                     | `CorpusDataset`                       | stable identity              |
| `lexicon.corpora.datasetVersions`              | `CorpusDatasetVersion`                | immutable source version     |
| `lexicon.corpora.frequencyObservations`        | typed `FrequencyObservation` tables   | SPLIT by target kind         |
| `lexicon.corpora.attestations`                 | typed `Attestation` tables            | SPLIT by target kind         |
| `lexicon.corpora.collocationObservations`      | `CollocationObservation`              | DIRECT                       |

## 6. 词书、学习目标和题库

| Artifact 数组                           | PostgreSQL                                                     | 类型                                   |
| --------------------------------------- | -------------------------------------------------------------- | -------------------------------------- |
| `learning.books`                        | `VocabularyBook`                                               | stable identity                        |
| `learning.bookEditions`                 | `VocabularyBookEdition` + `LexiconReleaseBookEdition`          | immutable edition + release membership |
| `learning.bookItems`                    | `VocabularyBookItem` + typed Headword/Entry target             | SPLIT                                  |
| `learning.proficiencyFrameworks`        | `ProficiencyFramework`                                         | stable identity                        |
| `learning.proficiencyFrameworkVersions` | `ProficiencyFrameworkVersion`                                  | immutable source version               |
| `learning.proficiencyLevels`            | `ProficiencyLevel`                                             | explicit hierarchy                     |
| `learning.proficiencyClaims`            | typed Headword/Entry/Sense claim tables                        | SPLIT；仅 SOURCE_ASSERTED              |
| `learning.learningObjectives`           | `LearningObjective`                                            | stable identity                        |
| `learning.objectiveRevisions`           | `LearningObjectiveRevision`                                    | release revision                       |
| `learning.objectiveSubjects`            | 五类 `LearningObjective*Subject`                               | SPLIT by subject kind                  |
| `learning.objectiveHints`               | `LearningObjectiveHint`                                        | DIRECT                                 |
| `learning.pedagogicalMaterials`         | `PedagogicalMaterial`                                          | stable identity                        |
| `learning.pedagogicalMaterialRevisions` | `PedagogicalMaterialRevision`                                  | release revision                       |
| `learning.pedagogicalMaterialTargets`   | 七类 `PedagogicalMaterial*Target`                              | SPLIT by target kind                   |
| `learning.pedagogicalMaterialBlocks`    | text/example/media typed material block tables                 | SPLIT by block kind                    |
| `learning.pedagogicalMaterialMentions`  | `PedagogicalMaterialLexicalMention`                            | DIRECT；offset + typed lexical target  |
| `learning.pedagogicalMaterialCitations` | `PedagogicalMaterialBlockCitation`                             | DIRECT；引用 ContentEvidence           |
| `learning.assessmentStimuli`            | `AssessmentStimulus`                                           | stable identity                        |
| `learning.stimulusRevisions`            | `AssessmentStimulusRevision`                                   | release revision                       |
| `learning.stimulusBlocks`               | text/example/media/material-ref typed block tables             | SPLIT by block kind                    |
| `learning.exerciseStimulusRefs`         | `ExerciseStimulusRef`                                          | DIRECT                                 |
| `learning.exerciseItems`                | `ExerciseItem`                                                 | stable identity                        |
| `learning.exerciseRevisions`            | `ExerciseRevision`                                             | release revision                       |
| `learning.exerciseResponseConfigs`      | choice/short-text/extended-text/no-capture typed config tables | SPLIT by response kind                 |
| `learning.exerciseChoices`              | `ExerciseChoice`                                               | DIRECT                                 |
| `learning.exerciseChoiceTargets`        | typed lexical target tables                                    | SPLIT by target kind                   |
| `learning.correctResponses`             | `ExerciseCorrectChoice` / `ExerciseAcceptedText`               | SPLIT by response kind                 |
| `learning.exerciseFeedback`             | `ExerciseFeedback`                                             | DIRECT                                 |
| `learning.exerciseRubrics`              | `ExerciseRubricCriterion`                                      | DIRECT                                 |
| `learning.assessmentBlueprints`         | `AssessmentBlueprint`                                          | stable identity                        |
| `learning.assessmentBlueprintRevisions` | `AssessmentBlueprintRevision`                                  | release revision                       |
| `learning.assessmentSections`           | `AssessmentSection`                                            | DIRECT recursive                       |
| `learning.assessmentSelectionRules`     | quota/scope/pinned-item typed tables                           | SPLIT by rule kind                     |

题目已在最终 JSON 中完成生成、去重和验证。importer 不生成选项、不修补答案、不调用 AI，只把 typed union 投影到对应表。

每个 `ExerciseRevision` artifact row 的 `exerciseTaskKind`、`evidenceKind`、`responseKind`、`responseCardinality`、`responsePlacement`、`gradingMode`、`validationLevel` 和 `authoredDifficultyTier` 直接写入同名列，并由共享 contract validator 先检查允许矩阵。`NO_CAPTURE` 不写 correct/text/audio response，只投影配置并要求 `REVEAL` stimulus 与运行时 self-report。Objective 中不存在 cue/answer 映射；任何呈现内容必须来自 Exercise/Stimulus 数组。

## 7. 质量 profile

| Artifact 路径                      | PostgreSQL                              | 类型                                       |
| ---------------------------------- | --------------------------------------- | ------------------------------------------ |
| `quality.profiles`                 | `ContentProfile`                        | stable identity                            |
| `quality.profileVersions`          | `ContentProfileVersion`                 | immutable version                          |
| `quality.profileEvaluations`       | `ContentProfileEvaluation`              | DIRECT                                     |
| `quality.profileEvaluationTargets` | typed `ContentProfileEvaluation*Target` | SPLIT by target kind                       |
| `quality.coverage`                 | `ContentRequirementEvaluation`          | DIRECT                                     |
| `quality.sourceStatistics`         | release/build summary                   | summary projection；保留 hash/count 可审计 |
| `quality.exerciseStatistics`       | release/build summary                   | summary projection；不建立使用/校准事实表  |

`quality.validationSummary` 是 object 而不是数组，写入 `LexiconRelease.validationSummary`；它仍受 shape mapper 覆盖，但不进入 array mapping registry。

API 展示的四种 completeness 来自导入后的 evaluation/requirement rows，不在请求时根据 null 猜测。完整内部 `ValidationIssue` 仍属于构建运维域。

## 8. 不进入 artifact 的数据库表

### 8.1 运行时用户事实

以下数据由 API 在 artifact 激活后产生，绝不公开或随词典 release 导入：

- `User` 及其 `UserEmail`、`PasswordCredential`、`ConsentRecord`、`AuthSession`、`OperatorRoleAssignment`；
- `UserBookEnrollment`, `DailyStudyPlan`, `DailyStudyPlanItem`；
- `UserObjectiveMemoryState`, `ReviewEvent`, `ReviewStateSnapshot`；
- `ExerciseAttempt`、presented/selected choice、encrypted text artifact；
- `AssessmentSession`, `AssessmentSessionItem`, `AssessmentResult`；
- notebook ownership/collection rows；
- Tutor/Grammar/AI usage、Reading Core、Reddit experience 用户数据。

`FSRSParameterSet` 是版本化应用调度配置，由 API migration/config release 建立，不属于某个 lexicon artifact；ReviewEvent 仍固定其 parameter set ID，保证可重放。

### 8.2 运维和构建事实

- `LexiconReleaseActivation`：由显式 activation 事务生成；
- `ProcessingRun`, `Candidate`, `CandidatePromotionMap`, provider cache：由 compiler/importer 运行生成；
- `ValidationIssue`：完整 issue 存受控构建/DB 运维域，artifact 的 `quality` 只含可公开的规则摘要与 count；
- importer checkpoint、heartbeat、staging partition：均为运行时状态。
- background job/progress、outbox、approval、deployment release 和 security audit：均为平台运行事实。

### 8.3 首版不建立校准事实

0.0.1 不建立题目使用聚合或校准表。真实作答只保存为运行时 `ExerciseAttempt`；未来统计或校准必须另立 ADR、schema version 和隐私门禁，不能塞入 artifact 的 `authoredDifficultyTier`。

## 9. 导入顺序与完备性

固定写入顺序：

1. manifest、vocabulary、source、rights、provenance；
2. stable Headword/Entry/Sense/Concept/Morph/Morpheme 等 identities；
3. release revisions、forms 和基础内容；
4. relations、SynSem、morphology、etymology、corpus；
5. books、objectives、pedagogical materials、stimuli、exercises、blueprints；
6. 全局引用、profile、count 和数据库 summary 验证。

CI 从 JSON Schema 中枚举所有 artifact arrays，并与 importer mapping registry 做双向比较：缺 mapper、重复 mapper、目标表未声明 owner 或 runtime 表被错误映射都直接失败。这项测试防止新增 JSON 字段后被 importer 静默忽略。
