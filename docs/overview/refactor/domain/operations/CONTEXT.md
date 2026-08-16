# Platform Operations

本上下文管理可恢复执行、内容构建、审核和应用发布事实，不决定词汇、学习或 Agent 内容的语义。

## Language

**Job**:
一次可调度执行激活的状态；领域流程等待后恢复或由 User 重试时会创建新的 Job。
_Avoid_: BackgroundJob, paused task, queue message

**JobAttempt**:
Executor 对一个 Job 的一次带 lease、heartbeat、fencing token 和失败证据的执行尝试。
_Avoid_: retry counter

**BuildRun**:
从固定输入、配置和工具版本生成候选 LexiconArtifact 的领域流程。
_Avoid_: Job, script run

**SourceDatasetVersion**:
由 URI、checksum、取得时间和 parser version 固定，并通过验证与 RightsDecision 才可参与 BuildRun 的不可变来源版本。
_Avoid_: latest source, source file

**RightsDecision**:
基于明确证据，对一个 SourceDatasetVersion 的 build、serve、export 和 attribution 权利作出的版本化决定。
_Avoid_: license flag, owner approval

**PublishRun**:
将一个固定 LexiconArtifact 校验并转换为未激活 LexiconRelease 的领域流程。
_Avoid_: database refresh, importer task

**LexiconArtifact**:
由内容 hash 标识、通过结构验证并等待发布的标准数据制品。
_Avoid_: data dump, seed file

**ReleaseActivation**:
把已验证 LexiconRelease 设为默认服务版本的审计决定。
_Avoid_: deploy data, overwrite

**ReviewBatch**:
按风险规则组织的一组待人工审核候选及其抽检结论。
_Avoid_: QA list

**CandidateRevision**:
审核中某个候选内容、证据和验证摘要的不可变版本；任何修改都会产生新 revision 并使旧决定失效。
_Avoid_: editable candidate row, draft JSON

**DeploymentRelease**:
由版本、commit 和不可变镜像 digest 标识的应用发布，与 LexiconRelease 分开演进。
_Avoid_: deployment attempt

**AuditEvent**:
能够说明谁在何时以何种权限执行敏感决定的不可变记录。
_Avoid_: admin log

**AuditExport**:
从固定结构化查询快照异步生成、带 schema version 与内容 hash 的短期可下载审计制品。
_Avoid_: export current table, CSV dump
