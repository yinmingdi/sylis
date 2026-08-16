# Artifact 发布与 LexiconRelease

## 1. Lexicon Publisher 边界

`apps/backends/lexicon-publisher` 是独立可部署应用，只接收：

```text
artifact URI/path + expected SHA-256 + target lexicon/environment + PublishRun
```

它不下载 ECDICT/Kaikki、不解析有道、不调用模型、不选择 Sense、不生成练习，也不持有 User/API session secret。依赖限于 `@sylis/lexicon-artifact`、`@sylis/job-contracts`、`@sylis/job-runtime`、`@sylis/database` 和 `@sylis/utils`；禁止依赖 `@sylis/lexicon-compiler`、Model Gateway client 或 Provider SDK。

Publisher 构建未激活 release。Activation 由 Admin API 的独立审批 command 完成，不能成为 PublishRun 的最后一步。

## 2. 正式职责命令

```bash
# 完全离线，不读取 DATABASE_URL
pnpm --filter @sylis/lexicon-publisher artifact:validate \
  --artifact ./sylis-lexicon-v1.json.zst \
  --sha256 <expected>

# 连接目标数据库，只读预演
pnpm --filter @sylis/lexicon-publisher release:plan \
  --artifact ./sylis-lexicon-v1.json.zst \
  --sha256 <expected>

# 执行已创建的 PublishRun activation Job
pnpm --filter @sylis/lexicon-publisher start
```

不提供 Publisher CLI `activate`；activation 只能调用受保护 Admin command。命令不用 `phase1`、`importer start --mode` 等临时名称。

## 3. Artifact preflight

离线 validation 在不读取数据库的进程完成：

1. 压缩字节上限和外部 SHA-256；
2. 流式 zstd 解压、decompressed byte/ratio、single member 与 trailing-data；
3. schema major、manifest count 与 streaming JSON Schema；
4. canonical payload content hash；
5. source/vocabulary/text profile 与 rights/export policy；
6. ID/reference closure、stable array order；
7. Artifact arrays 与 publisher mapping registry 双向完备。

未知字段、缺 required/null、非法 discriminator、内嵌 releaseId 或未映射数组直接失败，且不建立数据库连接。

## 4. 数据库只读计划

`release:plan` 完成相同 preflight，再用 read-only transaction 检查 Prisma schema/invariant compatibility、目标 Lexicon/language、相同 Artifact 的幂等结果、extension/collation/空间/权限/advisory lock 和 mapping registry。

只读计划不创建 PublishRun、Job、staging partition 或 LexiconRelease，不获取写锁；数据库写入计数必须为零。

## 5. Staging 与 COPY

所有 Artifact entity array 流入同一个 `UNLOGGED LexiconStagingRecord`，以闭合的 `collectionPath` 枚举、`publishRunId` 和 position 隔离；不为 108 个 collection 复制 108 套 staging DDL。Publisher：

1. 获取 `lexiconId` advisory lock；
2. 创建/清理本 Run partition；
3. streaming parser 转换为 tabular rows；
4. `COPY FROM STDIN` 批量写入；
5. 执行 NOT NULL、duplicate、FK-like join、count/hash 检查；
6. 建必要 index 后进入 release build。

成功 validation 后，Publisher 在同一事务中把 PublishRun 标为 SUCCEEDED 并删除该 Run 的 staging；失败或取消时保留 staging 供同一 Run 按 checkpoint 恢复，Publisher 在后续 Job 启动时按 `LEXICON_STAGING_RETENTION_HOURS` 清理超期数据。PostgreSQL crash 导致 UNLOGGED 内容丢失时从固定 Artifact hash 重新 COPY，不把 staging 当成事实来源。

禁止对每个词执行 Prisma `create/upsert` 循环。大批量 release 使用参数化 SQL/COPY，Prisma 用于普通请求和低量 User 写入。

## 6. Release build

在受控事务中：

1. 查询相同 Artifact hash 的既有成功结果并幂等返回；
2. 创建 `LexiconRelease(DRAFT)` 与数据库生成的 releaseId；
3. 先写 stable identities，再写 release revisions/facts；
4. 按 dependency order `INSERT ... SELECT`；
5. 写 provenance/evidence 和 typed relation；
6. 计算数据库 count/content summary 并与 manifest 对比；
7. commit DRAFT；失败整笔回滚。

Artifact 不提供或覆盖数据库 releaseId。正式表不允许 unresolved target 或临时空 FK。

Publisher 不把 Artifact payload 复制到永久 `ArtifactProjectionRecord`；无损交换事实只存在于 immutable Artifact，数据库保存正式关系模型、来源证据、manifest counts 和 validation summary。

## 7. 全局 validation

DRAFT 进入 VALIDATING 后检查：

- release-scoped FK、Entry canonical Form/Sense、Sense parent/lineage/relation；
- Concept membership、morphology offset、frame/SynSem mapping；
- provenance、rights、book edition coverage；
- PedagogicalMaterial target/block/citation、Objective primary subject；
- Exercise response/answer/validation matrix 与 blueprint satisfiability；
- `LEXICON_PUBLISHABLE`、`LEARNER_CORE`、`STUDY_READY` profiles；
- 数据库 summary 与 Artifact manifest。

全部通过后在单独事务转为 VALIDATED。失败保留 report，旧 active release 不受影响；不能把 VALIDATING 原地改回 DRAFT 后继续猜测。

## 8. Activation 与回滚

Admin activation 绑定 User、MFA re-auth、policyVersion、action digest、expected current release、reason 和 approval。短事务锁定 active pointer、验证 target VALIDATED/unrestricted、追加 `LexiconReleaseActivation`，再 compare-and-swap `activeReleaseId`。

回滚执行同一 command 指向上一 VALIDATED release；不逐表恢复、不重新 publish。Publisher 的数据库 role 无权更新 active pointer。

## 9. Job、进度与恢复

PublishRun 的初始执行和 User retry 各创建 activation Job；临时失败在同一 Job 创建新 JobAttempt。Staging 以 `publishRunId/jobId` 隔离，只有当前 fencing token 可写 progress/checkpoint/result。

阶段：`ARTIFACT_VALIDATE`、`DB_PLAN`、`STAGING_<ENTITY>`、`STAGING_VALIDATE`、`BUILD_IDENTITIES`、`BUILD_FACTS`、`GLOBAL_VALIDATE`、`COMMIT`。每 30 秒追加 processed/total/rate/ETA reliability 和 heartbeat；长 SQL 至少每 15 秒 heartbeat。

Checkpoint 固定 Artifact hash、handler/schema version、staging summary 和已提交边界。崩溃后新 Attempt 只有在这些值完全一致时恢复；Redis 仅唤醒，不保存状态。完整协议见 [Job 与执行协议](../architecture/background-jobs.md)。

## 10. Railway

Lexicon Publisher 不对公网开放，只暴露私网 `/live` 与 `/ready`。它使用最小数据库 role、private Bucket read credential 和自己的 service identity；不拥有模型、session/CSRF、SMTP、Reddit 或 User content key。

GitHub Actions 构建并推送 private GHCR image，Railway 按 immutable digest 拉取；不在 deploy 阶段重新构建源码。CPU 未满不表示逐行 SQL 有效，COPY + set-based SQL 用于消除 network round trip 和 transaction overhead。

## 11. 与应用发布分离

```text
main -> immutable images -> staging -> protected release -> same images -> production

manual BuildRun -> Lexicon Builder -> candidate JSON
  -> Admin PublishRun -> Lexicon Publisher -> VALIDATED release
  -> separate Admin activation
```

应用部署不自动 build/publish/activate Lexicon；Lexicon activation 也不重新部署十二个 app。
