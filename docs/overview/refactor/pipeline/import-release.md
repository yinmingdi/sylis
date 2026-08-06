# JSON 导入与 Lexicon Release

## 1. Importer 边界

目标服务名为 `@sylis/lexicon-importer`，替代 `@sylis/vocabulary-importer`。它只接收：

```text
artifact URL/path + expected SHA-256 + target lexicon/environment + mode
```

它不下载 ECDICT/Kaikki、不解析有道、不调用 AI、不选择 Sense，也不拥有业务 API credentials。

它唯一的词典领域 package 依赖是 `@sylis/lexicon-contracts`；另外只允许依赖实现无关的 `@sylis/background-jobs`、server-only `@sylis/database` 与纯 `@sylis/utils`。它不得依赖 `@sylis/lexicon-compiler` 或 `@sylis/ai-provider`。数据库投影规则属于 importer，自然语言/source/AI 规则属于 compiler。

## 2. 命令

```bash
# 完全离线验证，不读取 DATABASE_URL
pnpm --filter @sylis/lexicon-importer validate-artifact \
  --artifact ./sylis-lexicon-v1.json.zst \
  --sha256 <expected>

# 连接目标数据库但只读预演
pnpm --filter @sylis/lexicon-importer start \
  --artifact ./sylis-lexicon-v1.json.zst \
  --sha256 <expected> \
  --mode dry-run

# 构建 DRAFT，不激活
pnpm --filter @sylis/lexicon-importer start \
  --job-id <background-job-id> \
  --artifact ./sylis-lexicon-v1.json.zst \
  --sha256 <expected> \
  --mode import

# 独立验证 DRAFT
pnpm --filter @sylis/lexicon-importer validate \
  --job-id <background-job-id> \
  --release <release-id>

# 受保护流程中的显式激活
pnpm --filter @sylis/lexicon-importer activate \
  --release <release-id> \
  --expected-current <old-release-id> \
  --reason <change-ticket>
```

写入模式必须由受保护 command 预先创建对应 `BackgroundJob` 和 typed `ImportJob`/`LexiconValidationRequest`，runner 只能 claim 传入 ID 且 kind/executor 匹配的 Job。`import` 和 `validate` 都永不隐式 activate。只读 dry-run 不创建 Job 或数据库行。

## 3. 离线 Artifact validation

`validate-artifact` 在不读取 `DATABASE_URL` 的进程中完成：

1. artifact 下载/读取、压缩字节上限和外部 `.json.zst` checksum；
2. 流式 zstd 解压、decompressed byte/ratio 上限、single frame/member 与 trailing-data 检查；
3. schema major、manifest count 上限和 streaming JSON Schema；
4. 解压后 canonical JSON 的 internal content hash；
5. source/vocabulary/text profile；
6. ID reference 和 array order；
7. schema arrays 与 importer mapping registry 双向完备；
8. artifact rights/export policy。

任何失败都不会建立数据库连接。Artifact row 如果出现 `releaseId`、未知字段、缺失 required/null 字段或未定义 typed discriminator，JSON Schema 直接拒绝。

## 4. 数据库只读 dry-run

`start --mode dry-run` 先执行同一离线验证，再以数据库 read-only transaction 检查：

1. migration/schema compatibility version；
2. 目标 Lexicon 是否存在且语言一致；
3. 相同 artifact hash/version 的幂等结果；
4. extension、collation、可用空间、权限和 advisory lock 可用性；
5. schema arrays 与当前 importer mapping registry 双向完备。

Dry-run 不创建 ImportJob、staging partition 或 LexiconRelease，也不取得写锁；数据库写入计数必须为零。

## 5. Staging

为每个顶层 entity array 建对应 unlogged staging table，并附 `importRunId`。流程：

1. 取得 `(lexiconId)` transaction advisory lock。
2. 创建/清理本 run staging partition。
3. streaming parser 按数组转换为 tabular rows。
4. `COPY FROM STDIN` 批量写入。
5. 对 staging 执行 NOT NULL、duplicate、FK-like join 和 count 检查。
6. 创建必要索引后再进入 release build。

PostgreSQL 官方建议大批量装载优先 COPY，并在数据载入后创建索引；具体顺序以目标表约束和恢复要求测试决定。[PostgreSQL populate](https://www.postgresql.org/docs/current/populate.html)

## 6. Release build

单次数据库事务内：

1. 以 `artifactHash` 查询已有 import result；已有 VALIDATED 相同 hash 时把当前 Job 以同一结果引用幂等完成。
2. 创建 `LexiconRelease(status=DRAFT)`。
3. 为 artifact 创建唯一数据库 `releaseId`，并在 staging projection 中注入；artifact row 本身不得提供或覆盖该值。
4. 先写 stable identities，再写一一对应的 release revisions/facts；显示/POS/parent 等 release fact 不从 identity row 推断。
5. 按 dependency order 用 `INSERT ... SELECT` 从 staging 集合式写入。
6. 写 provenance/evidence，再补强 FK/关系；不得暂存正式空 target。
7. 计算数据库侧 count/hash summary，与 manifest 对比。
8. commit DRAFT；失败整笔回滚。

不要通过 Prisma 对每个词循环 `create/upsert`。Prisma 仅用于 API 普通查询和低量用户写入；bulk release build 使用参数化 SQL/COPY。

## 7. Validation

DRAFT 验证包括：

- 所有普通/跨语言复合 FK；
- Entry 至少一个 canonical Form 和 Sense；
- Sense parent、translation、lineage、relation 图；
- Concept canonical membership；
- relation 对称/方向/层级；
- morphology offset 和 SynSem mappings；
- provenance/rights；
- book edition 全覆盖；
- PedagogicalMaterial primary target/block/mention/citation/material-as-stimulus、Objective primary subject、Exercise response/answer/validation level 和 blueprint selection；
- `LEXICON_PUBLISHABLE`, `LEARNER_CORE`, `STUDY_READY` profiles；
- 数据库 content summary 与 artifact manifest。

开始全局校验前以受控转换把 DRAFT 标记为 VALIDATING；通过后在单独事务标记为 VALIDATED。失败保留 validation report，并以新 ImportJob 重建 release，不把 VALIDATING 倒改回 DRAFT。validator 版本写进 release。

## 8. Activation 与回滚

activation 事务：

```sql
BEGIN;
SELECT active_release_id FROM lexicon WHERE id = $1 FOR UPDATE;
-- compare-and-swap expected current
-- verify target VALIDATED and unrestricted
INSERT INTO lexicon_release_activation (...);
UPDATE lexicon SET active_release_id = $target WHERE id = $1;
COMMIT;
```

回滚执行同一个命令，把 target 指向上一 VALIDATED release；不逐表恢复、不重新导入。

## 9. 进度与恢复

阶段：`DOWNLOAD`, `ARTIFACT_VALIDATE`, `DB_DRY_RUN`, `STAGING_<ENTITY>`, `STAGING_VALIDATE`, `BUILD_IDENTITIES`, `BUILD_FACTS`, `GLOBAL_VALIDATE`, `COMMIT`。每 30 秒输出 processed/succeeded/failed/rate/ETA 和数据库 phase；长 SQL 每 15 秒 heartbeat。

staging 以 `BackgroundJob.id` 隔离。runner 只凭当前 lease token 写 progress/checkpoint；崩溃后 lease 到期，另一个 Importer runner 从最新合法 checkpoint 接管，不另写 `RUNNING/INTERRUPTED` 状态。相同 artifactHash 的成功阶段只有在 checkpoint hash、handler version 和数据库 summary 全部匹配时才可复用，未 commit 的 release 不可见。完整规则见 [BackgroundJob、Worker 与进度协议](../architecture/background-jobs.md)。

## 10. Railway 服务

- importer 是 job service，不对公网开放。
- importer 只 claim `LEXICON_IMPORT`/`LEXICON_VALIDATE`，claim/lease/checkpoint/result 使用 `@sylis/background-jobs` contract；不从 API 源码复用 service/repository。
- 只拥有 `DATABASE_URL`, artifact read token（如需要）和非敏感 run config。
- 不拥有 `AI_*`、session/CSRF、field-encryption、SMTP、Reddit 或 Web 变量。
- service source 固定为 GitHub Actions 构建、推送并解析出的私有 GHCR immutable digest；Railway 不在 Importer 部署阶段重新构建源码。
- CPU 未满不代表逐行远程 SQL 快；COPY + set-based SQL 解决 network round trip 和 transaction overhead。

## 11. 应用部署与内容发布分离

```text
release/* -> main -> CI -> API/Web/Admin/Worker/Compiler Runner Railway deploy

protected build request -> Railway Compiler Runner -> verified GitHub Release JSON
  -> manual importer dry-run/import
  -> validate
  -> protected activation
```

应用代码发布不得自动执行完整词典构建或导入；词典激活也不要求重新部署 API/Web/Admin/Worker/Compiler Runner。
