# Agent 文件与模型交换

> 状态：`0.0.1` 目标架构。本文定义 Agent 消息正文、模型交换、用户上传、内容处理、Artifact 接受和删除。关系真相仍由 Agent API 拥有；加密模型正文由 Model Gateway 拥有，文件 revision 由内容域拥有。

## 1. 内容分层

不要把聊天、Provider body、文件和 Agent Artifact 塞进 `AgentMessage.content`：

| 层               | Owner                           | 保存内容                                                                                    |
| ---------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| Agent 关系层     | Agent API                       | Session/Run/Message/MessageBlock/Event/Artifact 元数据、sequence、typed references          |
| 模型正文层       | Model Gateway                   | 加密 `ModelContentBody`、规范化 `ModelExchange/Part`、retention/consent 状态                |
| 文件关系层       | Agent API / User content module | `ContentAsset`、不可变 `ContentAssetRevision`、owner、文件名、MIME、状态和 current revision |
| 文件字节与派生层 | Asset Processor + Bucket        | quarantine/clean bytes、OCR、文本、缩略图、索引和 hash                                      |
| 领域事实层       | Lexicon/Learning/Reading owner  | 用户明确接受后产生的 typed command 结果；不直接消费模型 raw body                            |

`AgentMessage` 只保存 role、sequence、visibility 和来源引用；lifecycle 由 append-only Event 与 Block 状态投影，正文与交互由 owned `AgentMessageBlock` tree 表达。文本类 Block 引用精确 `ModelContentBody`，引用类 Block 使用匹配 kind 的强关系指向 AgentToolCall、AgentArtifactRevision、AgentProposal、AgentPlanRevision、AgentWaitCondition 或 ContentAssetRevision，不保存正文密文或 polymorphic ID。`ModelExchangePart` 引用精确 `ModelContentBody` 或 `ContentAssetRevisionId`。每个历史引用都固定 revision，不能随着“当前文件版本”漂移。

跨服务写入采用 idempotent body-first protocol：Agent API 先让 Gateway 创建绑定 owner/purpose/hash 的 content body 或有序可见 fragment，再在本地事务追加 Message/Block/Artifact/Proposal 关系和 Event。关系提交失败产生的 orphan body/fragment 不可查询，并由短期 retention job 删除。读取时 Agent API 先验证 User/Session/Message/Block owner，只代理单个已引用 body，不取得列表或通用解密能力。流式 fragment 的模型顺序、合并、封口和 SSE 恢复见 [Agent 会话 Block](./agent-conversation-blocks.md)。

## 2. 留存政策

基础聊天始终保留用户消息和最终回答，直到 User 删除；这保证会话可恢复、可导出。只有 User 明确同意“保留完整模型交换”后，才额外保存规范化的中间 assistant/tool 输入输出，用于可解释历史和个人诊断。中间 part 固定 `ModelInvocation + AgentRunStep + blockIndex/modelPosition + providerCallId?`，从而保留 mixed text/tool 和多调用顺序；该引用只用于历史解释，不能作为回放执行指令。

无论是否同意，以下内容永不持久化：

- hidden chain-of-thought / reasoning token；
- System Prompt 正文与内部 policy prompt；
- Provider 原始 request/response body、header 和 SDK dump；
- secret、cookie、Authorization、permit ticket 和解密后的 BYOK；
- 未经 redaction 的异常 body 或 telemetry payload。

Consent 可拒绝且不影响 Agent 基础功能。撤回后 optional exchange part 立即从 projection 隐藏，并在 30 天内 hard purge；用户消息和最终回答按基础聊天政策保留，除非用户删除会话或账号。只有内容 owner User 可读取 exchange 正文；Admin/support 只能看 route、token、cost、latency、hash 和错误分类元数据。

支持排障由 User 主动生成可预览、可编辑、自动脱敏的 `DiagnosticBundleRevision`，不提供 Support “打开完整聊天”的后台入口。Bundle draft 只复制 User 明确选择的 message/result/error metadata 和 typed resource refs，自动删除 token、cookie、secret、system prompt、hidden reasoning、Provider raw body、未选择消息与第三方标识。User 每次编辑/确认都产生 immutable revision；确认 revision 通过 `confirmedFromRevisionId` 固定同 bundle、同 content hash 的来源 draft，不能原地确认或确认 stale current revision。

SupportGrant 只能固定一个已确认 DiagnosticBundleRevision、指定 SUPPORT Operator、purpose 和 expiry；默认 2 小时、最长 24 小时。每次读取都在线验证 grant 并写 DataAccessAuditEvent。Grant 过期或撤销后立即停止新读取，但不改变 owner User 自己的 bundle revision。

## 3. 上传与处理状态机

```text
upload intent
  -> presigned quarantine upload
  -> finalize(size/hash/MIME)
  -> QUARANTINED
  -> ASSET_SCAN Job
  -> REJECTED | CLEAN
  -> ASSET_EXTRACT or ASSET_OCR Job
  -> ASSET_LEXICAL_INDEX Job
  -> READY | PROCESSING_FAILED
```

创建 intent 时固定 owner、expected size、declared type、purpose 和 expiry。对象只能上传到内容寻址 quarantine key；finalize 必须验证实际 size/hash、magic bytes 和 intent，不能信任扩展名或浏览器 MIME。未 finalize、过期和 REJECTED 对象由 retention job 清理。

这是一个多 Job pipeline，不是一个 Job 内部的隐藏阶段。`finalize` 只返回首个 `ASSET_SCAN` Job；scan 成功后按 MIME 创建 `ASSET_EXTRACT` 或 `ASSET_OCR`，文本结果提交后再创建 `ASSET_LEXICAL_INDEX`。每个 Job 都有独立的 attempt、progress sequence、terminal event 和 owner 校验，当前 revision 的 Asset projection 暴露仍处于 `QUEUED | RUNNING` 的 `processingJobs`。只有所有 blocking processing run 成功后，Asset 和 revision 才同时进入 `READY`。

浏览器依次订阅每个当前 Job 的 SSE。一个 Job 到达 terminal 后只读取一次最新 Asset projection，以发现下一批 `processingJobs` 或最终 `READY | REJECTED`；禁止定时 GET Asset、循环 GET Job 或从 `finalize.jobId` 猜整条 pipeline 已完成。客户端必须检测重复 Job、无状态推进和超过 16 次转换并 fail closed。

v1 支持：TXT、Markdown、PDF、DOCX、EPUB、PNG、JPEG、WebP。拒绝：独立 HTML、SVG、通用 ZIP/TAR/7z 等 archive、带宏文档、可执行文件和格式嵌套炸弹；DOCX/EPUB 只作为白名单 container 按规范 manifest、安全子类型和 path traversal 规则解析。限制单文件大小、页数、像素、压缩比、解析时间和派生对象总量。

本地 ClamAV 扫描是进入 clean Bucket 的强制门禁。病毒签名固定在 Asset Processor image build 中并记录版本，不能让 production 启动时下载未验证签名；scheduled CI 以同一受保护流程更新签名、重建并提升 image。解析器在无网络、低权限、CPU/内存/时间受限的隔离进程中运行。

## 4. 三类 Bucket

staging 与 production 各自使用相互隔离的三类 private Bucket：

1. `quarantine`：未信任上传，只允许 intent/finalize/scan 路径访问；
2. `clean-user-assets`：已扫描的用户文件、加密派生文本和缩略图；按 User 与 revision 授权；
3. `system-artifacts`：Lexicon Artifact、评测输入输出、验证报告、deployment evidence、加密 audit archive/export。

Bucket URL/key 不进入公开 DTO。下载使用短期、单对象、绑定 disposition 的 presigned URL。对象 key 使用随机/内容寻址标识，不含邮箱、原文件路径或 secret。数据库保存 checksum、size、encryption/version、scanner/parser version 和 object reference，Bucket 不是关系真相。

## 5. 自动与按需处理

`asset-processor` 是可独立部署的后台应用，只 claim 文件处理 Job：

- 自动：malware scan、类型验证、安全解析、文本抽取、OCR、语言检测、lexical indexing；
- 按需：vision 理解和 embedding，必须有明确 User action、ModelExecutionPermit、预算与 consent；
- 禁止：未经请求把所有文件自动发送给第三方模型。

Embedding 固定 model/route/revision/chunking policy，向量写入 PostgreSQL `pgvector`，并引用精确 `ContentAssetRevisionId`、chunk hash 和 embedding release。变更模型或 chunking 创建新 projection，不覆盖历史向量。DeepSeek 文本 route 不承担图片理解。

## 6. Agent Artifact 与文件 revision

模型生成文章、语法分析、翻译或练习时先创建 `AgentArtifactRevision` candidate。它可以引用输入文件 revision、Lexicon release、Capability release、ModelInvocation 和证据，但不是正式 Reading/Lexicon/Exercise truth。

用户执行“接受为文件”时：

1. Agent API 验证 artifact revision、owner 和 action digest；
2. 内容模块创建新的 immutable `ContentAssetRevision`；
3. 复制或内容寻址复用已经扫描/生成的正文；
4. 追加 AgentEvent 与 typed result reference；
5. 后续编辑永远创建新 revision。

若要进入 Reading、Notebook 或私人练习，再由对应 owner 接收明确 typed command。正式 Lexicon/题库仍需独立审核与 release 流程。

## 7. API 契约

```text
POST /api/agent/v1/assets/upload-intents
POST /api/agent/v1/assets/:id/finalize
GET  /api/agent/v1/assets/:id
GET  /api/agent/v1/assets/:id/revisions/:revisionId
GET  /api/v1/jobs/:jobId/events
POST /api/agent/v1/artifacts/:id/accept-as-asset
POST /api/agent/v1/sessions/:id/instructions
GET  /api/agent/v1/sessions/:id/events
DELETE /api/agent/v1/assets/:id
DELETE /api/agent/v1/model-exchanges/:id
GET  /api/agent/v1/diagnostic-bundles
POST /api/agent/v1/diagnostic-bundles
POST /api/agent/v1/diagnostic-bundles/:id/revisions
```

Instruction 引用已 `READY` 的精确 asset revision；不能在消息 body 中传任意 object URL。Session SSE 与 User Job SSE 都使用 `Last-Event-ID` 恢复，只发送关系事件、安全 preview 和 body reference，不发送文件字节、完整模型 exchange 或 secret。User Job GET/SSE 通过 `assetProcessing -> revision -> asset.ownerUserId` 校验所有权，但通用 Job cancel 仅允许自身定义了取消收敛语义的数据导出 Job。

## 8. 删除与并发

删除请求先在同一事务标记不可见、撤销下载并写 purge request；产品查询立即过滤。对象字节、正文密文、派生内容、向量和 optional exchange part 在 30 天内 hard purge，审计只保留不可逆 digest 与执行证据。

Purge 使用 revision id + object version/hash 的 CAS，不能删掉并发创建的新 revision。共享的内容寻址对象只有所有 owner reference 都满足 purge 后才物理删除。法律/安全 hold 必须是显式、可审计状态，不能默默延长普通产品留存。

## 9. 必测性质

- presigned intent/finalize 的 owner、expiry、size/hash/MIME 和重放；
- quarantine 对其他服务不可读，未扫描对象不能进入 clean 或 Agent context；
- ClamAV/解析 timeout、炸弹文件、恶意 DOCX/EPUB 和图片像素上限；
- revision pinning、Artifact accept 幂等、共享对象引用计数和 purge CAS；
- consent 拒绝/撤回、正文 owner isolation、Admin metadata-only、diagnostic bundle selected-ref/redaction/revision 和 exact SupportGrant access audit；
- pgvector projection 的 exact revision/model/chunk policy；
- SSE 断线恢复不泄露 body，fake Provider streaming 不保留 hidden reasoning/raw body。
- mixed text/tool 与多个 ToolCall 的 exchange part 和 AgentMessageBlock 保持 Step/model order，SSE replay 和 exchange replay 都不会执行工具。
- 多 Job pipeline 逐个通过 SSE 收敛，transition 间仅一次 Asset GET，无前端定时轮询、循环与重复 Job。
