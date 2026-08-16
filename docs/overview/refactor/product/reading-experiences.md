# Reading Core 与独立内容体验

## 1. 产品结论

Reddit 等外部内容来源保留来源特有页面、筛选器和交互；它们不合并成一个通用 feed。AI 阅读不是独立 experience 或 route，而是 Agent 的 `reading.compose` Capability。稳定文档版本、词汇标注、查词、收藏、阅读进度、学习目标提取和练习入口由 Reading Core 统一。

## 2. 核心对象

| 对象                      | 核心字段                                                                                              | 规则                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ReadingDocument`         | id、originId、ownerUserId?、externalKey?、currentRevisionId、status、visibility、createdAt、retiredAt | stable identity；current revision 必须属于本 document                    |
| `ReadingDocumentRevision` | documentId、revisionNo、languageTag、title、加密正文、keyVersion、contentHash、wordCount、publishedAt | immutable；练习与活动固定 revision                                       |
| `DocumentOrigin`          | kind、sourceKey、rightsPolicy、retentionPolicy、attribution                                           | `AI_GENERATED/REDDIT/USER_AUTHORED/...`                                  |
| `LexicalAnnotation`       | revisionId、selector、releaseId、typed lexical target、confidence                                     | 文本锚点与 target 都可验证                                               |
| `ReadingActivity`         | userId、documentId、revisionId、kind、position/progress/count/time、eventVersion、occurredAt          | append-only event；同 user/document 严格递增                             |
| `ReadingProgress`         | userId、documentId、revisionId、单调字段、eventVersion、started/last/completed time                   | Activity 的可重建 projection，不是第二份真相                             |
| `ReadingCollectionItem`   | userId、collectionId、documentId、note、tags、createdAt                                               | collection 与 item 必须同 owner；同 user/document 唯一                   |
| `ReadingTarget`           | userId、documentId、revisionId、releaseId、annotationId、objectiveRevisionId、policyVersion、rank     | 精确引用正文 annotation、annotation 的 Objective target 和同 User memory |

文本 selector 使用 `revisionId + revisionContentHash` 固定不可变正文，以 `UTF16_CODE_UNIT` 保存 DOM position，并保存 NFC-normalized exact/prefix/suffix 的 SHA-256 承诺及 context length，不把字符 offset 当唯一锚点。持有解密能力的可信服务必须同时核对正文 hash、position、surrogate boundary 和 quote context；数据库只保存承诺与复合 FK，不接收解密 key。设计语义参考 W3C Web Annotation selector model。[Web Annotation](https://www.w3.org/TR/annotation-model/)

## 3. Reddit Experience

- Reddit adapter 拥有 subreddit、post、comment、permalink、source cursor 和 API rate-limit 语义。
- Reading Core 只接收允许形成稳定阅读体验的 post/comment revision projection。
- source 删除、编辑或 retention 到期产生新同步事实；页面按策略隐藏/删除缓存，不永久展示已撤回来源内容。
- saved/history 使用 Sylis ReadingActivity/Collection；Reddit subscription 与来源 feed 设置仍属于 Reddit experience。
- 评论树、投票和 subreddit metadata 不进入通用 ReadingDocument schema。

## 4. Agent 生成阅读

- User 选择主题、体裁、长度、语言难度和目标来源；`reading.compose` Capability 创建 AgentRun 与 activation Job，完成后得到私人 AgentArtifact。发布到 Reading Core 时必须另走 typed Proposal 和 owner command。
- Agent Executor 读取显式 ReadingTargets 和允许的词典 evidence，先生成私人 AgentArtifact；经 schema、目标覆盖、文本质量和安全策略验证后，可由获批 Proposal 调用 Reading owner 发布 revision。
- 生成 revision 保存 PromptTemplate、ModelInvocation、target IDs 和 validation report；`usedWords JSON` 被 typed annotation 替代。
- 失败 Job 保留可解释错误与可重试性，不创建半成品 ReadingDocument。

发布链固定为：

```text
reading.compose
  -> immutable ARTICLE Artifact revision
  -> Proposal(exact artifactId + revisionId + contentHash)
  -> User APPROVE(actionDigest)
  -> COMMITTING(commitAttemptId + bounded lease)
  -> Product API revalidates User + Grant + digest + lease
  -> idempotent private ReadingDocument + ReadingDocumentRevision
  -> COMMITTED(exact idempotency record + documentId + revisionId)
```

`ReadingDocument.id`、revision id 和 origin key 从 Artifact revision 稳定派生；相同 Proposal、请求重放或租约接管只能得到同一个私有 Document/Revision。Product API 在 owner 边界再次验证当前 `commitAttemptId`、未过期 Proposal/Grant 和 action digest。并发批准只有一个有效提交者；进程中断后，过期 lease 可由新 fencing token 接管，迟到请求不能把新结果覆盖为失败。Proposal 被拒绝、目标不属于 User、Artifact kind/schema/hash 漂移或正文密文 hash 漂移时，不创建 ReadingDocument。

## 5. 全局查词与学习闭环

1. 页面请求固定 DocumentRevision 和 active lexicon release compatible projection。
2. Web 只对服务端 annotations 或用户显式选择文本发起 resolve，不用正则把所有 token 当词。
3. popup 显示 Headword -> Entry -> Sense 候选，用户选择的具体 Sense 可收藏到 Notebook。
4. ReadingTarget 的 exposure 创建独立活动；只有完成正式 ExerciseAttempt/ReviewEvent 才更新 FSRS。
5. 从内容生成练习必须固定 DocumentRevision、LearningObjective 和 Exercise validationLevel。

Activity projection 规则是确定性的：同 revision 的 progress、position、learnedWordCount 和 totalReadSeconds 取历史最大值；切换 revision 时这些字段从新 revision 的事件重新计算；`startedAt` 保留该 document 的首次活动时间，`lastReadAt` 等于最新事件时间，`completedAt` 等于当前 revision 首次 COMPLETE 时间。Activity 与 projection 在同一事务提交，deferred trigger 反向重建并拒绝任何漂移。

ReadingTarget 只从 `LexicalAnnotationTargetKind.OBJECTIVE` 产生。`LexicalAnnotationObjectiveTarget` 固定 annotation 对应的 Objective revision，`UserObjectiveMemoryState` 以 `(releaseId, objectiveId, objectiveRevisionId)` 精确绑定；缺少当前 User memory、跨 document revision、跨 release 或 annotation/objective 错配都由复合外键或 deferred trigger 拒绝。

## 6. 独立页面与共享能力

```text
/explore
/explore/reddit
/explore/reddit/:externalId
/agent
/agent/sessions/:sessionId
/reading/:documentId
/reading/library
```

每个 experience 自己决定列表布局和 filter；详情页组合共享 `reading-document`、`lexical-annotation`、`reading-progress`、`collect-target` 和 `exercise-entry` capabilities。禁止让共享组件依赖 Reddit DTO 或 AI provider response。

## 7. 算法与缺失状态

ReadingTarget 和 content relevance 使用 [算法注册表](../architecture/algorithms.md) 的版本化策略。没有学习目标时仍可阅读；没有可靠 lexical annotation 时允许用户选择文本查询，但不自动创建词典事实。来源不可用、内容撤回、revision 不兼容和 target coverage 为空是不同状态，不能统一显示“暂无数据”。

## 8. Ownership 与删除

AI/用户生成文档固定为 `PRIVATE + ownerUserId`，Reddit/curated 文档固定为无 owner 的 `PUBLIC`；来源类型与 visibility/owner 组合由数据库 deferred guard 强制。收藏只能进入当前 User 的稳定 `library` collection。到期且处于 RUNNING 的 User 删除请求会先删除 Target、Activity、Progress、Collection，再撤回并删除该 User 拥有的 revisions/documents；公共来源文档不随某个 User 删除。
