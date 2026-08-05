# Reading Core 与独立内容体验

## 1. 产品结论

Reddit、AI 阅读和未来内容来源保留独立页面、导航、筛选器和来源特有交互；它们不合并成一个通用 feed。稳定文档版本、词汇标注、查词、收藏、阅读进度、学习目标提取和练习入口由 Reading Core 统一。

## 2. 核心对象

| 对象                      | 核心字段                                                          | 规则                                       |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| `ReadingDocument`         | id、originId、externalKey?、createdAt、retiredAt                  | stable identity                            |
| `ReadingDocumentRevision` | documentId、languageTag、title、content、contentHash、publishedAt | immutable；练习与活动固定 revision         |
| `DocumentOrigin`          | kind、sourceKey、rightsPolicy、retentionPolicy、attribution       | `AI_GENERATED/REDDIT/USER_AUTHORED/...`    |
| `LexicalAnnotation`       | revisionId、selector、releaseId、typed lexical target、confidence | 文本锚点与 target 都可验证                 |
| `ReadingActivity`         | userId、revisionId、kind、position、occurredAt                    | append-only event；进度 projection 可重建  |
| `ReadingCollectionItem`   | userId、documentId、note、tags、createdAt                         | 收藏稳定 document，显示时选择可用 revision |
| `ReadingTarget`           | userId、revisionId、objectiveRevisionId、policyVersion、rank      | 只引用正文中真实 annotation                |

文本 selector 保存 normalized exact text、prefix/suffix context 和位置，不把字符 offset 当唯一锚点；revision immutable 后 selector 仍必须在构建/导入时验证。设计语义参考 W3C Web Annotation selector model。[Web Annotation](https://www.w3.org/TR/annotation-model/)

## 3. Reddit Experience

- Reddit adapter 拥有 subreddit、post、comment、permalink、source cursor 和 API rate-limit 语义。
- Reading Core 只接收允许形成稳定阅读体验的 post/comment revision projection。
- source 删除、编辑或 retention 到期产生新同步事实；页面按策略隐藏/删除缓存，不永久展示已撤回来源内容。
- saved/history 使用 Sylis ReadingActivity/Collection；Reddit subscription 与来源 feed 设置仍属于 Reddit experience。
- 评论树、投票和 subreddit metadata 不进入通用 ReadingDocument schema。

## 4. AI Reading Experience

- 用户选择主题、体裁、长度、语言难度和目标来源；请求在同一事务创建 `ReadingGeneration`、`BackgroundJob` 和 outbox event。
- Worker 读取显式 ReadingTargets 和允许的词典 evidence，生成候选 revision，经 schema、目标覆盖、文本质量和安全策略验证后发布。
- 生成 revision 保存 PromptTemplate、ModelInvocation、target IDs 和 validation report；`usedWords JSON` 被 typed annotation 替代。
- 失败 Job 保留可解释错误与可重试性，不创建半成品 ReadingDocument。

## 5. 全局查词与学习闭环

1. 页面请求固定 DocumentRevision 和 active lexicon release compatible projection。
2. Web 只对服务端 annotations 或用户显式选择文本发起 resolve，不用正则把所有 token 当词。
3. popup 显示 Headword -> Entry -> Sense 候选，用户选择的具体 Sense 可收藏到 Notebook。
4. ReadingTarget 的 exposure 创建独立活动；只有完成正式 ExerciseAttempt/ReviewEvent 才更新 FSRS。
5. 从内容生成练习必须固定 DocumentRevision、LearningObjective 和 Exercise validationLevel。

## 6. 独立页面与共享能力

```text
/explore
/explore/reddit
/explore/reddit/r/:name
/explore/reddit/posts/:externalId
/explore/ai-reading
/explore/ai-reading/:documentId
/reading/history
/reading/saved
```

每个 experience 自己决定列表布局和 filter；详情页组合共享 `reading-document`、`lexical-annotation`、`reading-progress`、`collect-target` 和 `exercise-entry` capabilities。禁止让共享组件依赖 Reddit DTO 或 AI provider response。

## 7. 算法与缺失状态

ReadingTarget 和 content relevance 使用 [算法注册表](../architecture/algorithms.md) 的版本化策略。没有学习目标时仍可阅读；没有可靠 lexical annotation 时允许用户选择文本查询，但不自动创建词典事实。来源不可用、内容撤回、revision 不兼容和 target coverage 为空是不同状态，不能统一显示“暂无数据”。
