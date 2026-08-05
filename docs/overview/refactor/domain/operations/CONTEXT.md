# Platform Operations

本上下文管理内容和应用的构建、审核与发布事实，不决定词汇或学习内容的语义。

## Language

**BuildRun**:
从固定输入、配置和工具版本生成候选 artifact 的可恢复执行。
_Avoid_: import, script run

**LexiconArtifact**:
由内容 hash 标识、通过结构验证并等待导入的标准数据制品。
_Avoid_: data dump, seed file

**ImportJob**:
将一个 LexiconArtifact 转换为数据库 DRAFT release 的可恢复执行。
_Avoid_: database refresh

**ReleaseActivation**:
把已验证 LexiconRelease 设为服务请求默认版本的审计决定。
_Avoid_: deploy data, overwrite

**ReviewBatch**:
按风险规则组织的一组待人工审核候选及其抽检结论。
_Avoid_: QA list

**DeploymentRelease**:
由 commit、镜像或构建证明标识的应用版本，与 LexiconRelease 分开演进。
_Avoid_: release

**BackgroundJob**:
承载 BuildRun、ImportJob、阅读生成、语法诊断或导出执行状态的唯一可恢复任务。
_Avoid_: capability-specific execution row, task row, queue message

**AuditEvent**:
能够说明谁在何时以何种权限执行敏感决定的不可变记录。
_Avoid_: admin log
