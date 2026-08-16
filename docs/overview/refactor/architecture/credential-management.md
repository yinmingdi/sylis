# 凭证与密钥管理

> 状态：`0.0.1` 目标架构。本文是 Platform Provider key、User BYOK、内部 service identity 和根密钥轮换的权威设计。Sylis v1 不向用户签发长期公共 API Key。

## 1. 分类与所有权

不要把所有“key”放进一张表：

| 类别                             | Owner                                  | 存储方式                                                             |
| -------------------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| User 密码、session、challenge    | Identity (`api`)                       | Argon2id 或不可逆 hash；绝不交给 Model Gateway                       |
| 内部 service identity            | Identity (`api`)                       | service public key + key id；private key 只在对应 Railway service    |
| Platform Provider credential     | Model Gateway                          | `CredentialProfile/Revision` envelope encryption                     |
| User BYOK                        | Model Gateway                          | `CredentialProfile/Revision` envelope encryption，`ownerUserId` 强制 |
| 一次性模型许可                   | Model Gateway                          | 短期 hashed nonce + 原子状态，不是长期 secret                        |
| GitHub/Railway deploy credential | GitHub protected environment / Railway | 不进入业务数据库                                                     |

`CredentialProfile` 是稳定身份，`CredentialRevision` 是不可变密文版本：

```text
CredentialProfile
  id
  ownerKind = PLATFORM | USER
  ownerUserId?
  providerKey
  label
  status
  currentRevisionId

CredentialRevision
  id
  profileId
  credentialType
  ciphertext
  nonce
  authTag
  encryptedDek
  kekVersion
  aadSchemaVersion
  fingerprint
  maskedHint
  providerMetadata
  createdAt / validatedAt / expiresAt / revokedAt
```

`ownerKind = PLATFORM` 时 `ownerUserId IS NULL`；`ownerKind = USER` 时必须存在 `ownerUserId`。该 XOR、current revision 归属、不可变 revision 和 ACTIVE 唯一性由数据库约束强制。

## 2. Envelope encryption

每个 revision 生成独立随机 256-bit DEK，凭证正文使用 AES-256-GCM 加密；DEK 再由当前 Credential KEK 包裹。AAD 至少绑定 profile/revision/provider/credential type/schema version，防止密文跨行替换。

```text
写入
  plaintext
    -> random per-record DEK
    -> AES-256-GCM ciphertext + nonce + tag
    -> KEK wraps DEK
    -> persist ciphertext + wrapped DEK + versions

调用
  ModelExecutionPermit
    -> load exact immutable revision
    -> unwrap DEK in Model Gateway memory
    -> decrypt only for provider request
    -> zero/drop references after use
```

数据库、Redis、Job、Outbox、日志、trace 和普通 DTO 永不出现明文。Redis 最多缓存 profile status、revision id 和健康元数据，不缓存 Provider key、OAuth token、DEK 或解密后的业务对象。

`fingerprint = HMAC-SHA-256(INDEX_KEY, normalizedSecret)` 只用于去重、审计关联和泄露检查，不用于恢复明文。它使用独立的 index key，不能改用裸 SHA-256。

## 3. Railway 根密钥

v1 不引入外部 KMS。每个环境在 Railway sealed variables 中分别保存：

```text
CREDENTIAL_KEK_CURRENT_VERSION
CREDENTIAL_KEK_V1
CREDENTIAL_INDEX_KEY_V1
MODEL_CONTENT_KEK_CURRENT_VERSION
MODEL_CONTENT_KEK_V1
```

Credential KEK 与模型正文 KEK 必须分离，staging 与 production 也必须分离。变量只注入需要它们的服务：Credential/Content KEK 仅进入 Model Gateway，文件对象加密所需的受限 key 仅进入 Asset Processor/Gateway 的明确路径。

[Railway sealed variables](https://docs.railway.com/variables#sealed-variables) 会注入目标 build/runtime，但值不能从 UI/API/CLI 取回，也不会随 PR environment、environment/service duplicate 或外部集成自动复制。应用绝不能把这种运行时可读能力转化为 Admin 展示或日志。根 KEK 的创建、备份和轮换属于 Railway 运维操作，不是 Admin 页面操作；恢复副本保存在离线加密密码库。把 KEK 改掉但没有旧版本会永久失去解密能力，因此旧版本必须保留到全部 rewrap 完成且验证通过。

Sylis 关闭 Railway Git source build/autodeploy，运行已经在无业务 secret 的 GitHub CI 中构建好的 GHCR digest；这样 KEK 不会暴露给仓库 Docker build step。Model Gateway 启动时只在运行进程读取 sealed variables，健康检查只报告 key version 是否可用。

## 4. 创建、轮换、撤销与 rewrap

User BYOK 创建/轮换需要 TLS、有效 USER session、近期 re-auth、CSRF 和幂等键；Platform Credential 创建/轮换要求 ADMIN session、`MODEL_OPERATOR`、密码 + MFA re-auth、reason 和幂等键。API/Admin API 只能作为同源认证和不记录 body 的 transport 入口，不能持久化、记录或缓存明文；只有 Model Gateway 能写 Credential 表和执行解密。

- 凭证轮换：创建新 immutable revision，验证 Provider 后原子切换 `currentRevisionId`；旧 revision 进入 RETIRED，不修改历史 invocation。
- 正常撤销：User 撤销自己的 BYOK；`MODEL_OPERATOR` 撤销 Platform Profile，立即阻止新 permit，不改写历史 invocation。
- 紧急隔离：`SECURITY_ADMIN` 可为明确安全原因追加 `QUARANTINE` event 并阻止新 permit；恢复 Platform Profile 要求同一 Operator 同时持有 `MODEL_OPERATOR + SECURITY_ADMIN`。Security event 不覆盖 CredentialRevision。
- KEK 轮换：增加 `CREDENTIAL_KEK_V{n}`，切 current version，新写入使用新 KEK；后台以 CAS 逐行 rewrap DEK，不重加密正文。
- index key 轮换：保留 versioned fingerprint 并双算过渡；不能靠覆盖旧 key 完成。
- Provider OAuth：access/refresh token 各自作为 typed encrypted field/revision；刷新产生新 revision，不把 token 放入通用 Redis cache。

所有操作写 immutable `CredentialAuditEvent`，只记录 actor、profile/revision id、动作、reason、结果、request id 和 digest，不记录 secret/ciphertext。

## 5. 读取与权限

普通 User 只能看到自己 Profile 的 provider、label、maskedHint、status、expiry 和 last validation；客户端可以保留自己刚提交的值，但服务端响应永不回显。`MODEL_OPERATOR` 只能枚举 Platform Profile 的 masked metadata/health，不能枚举 User BYOK。

User BYOK 仅在该 User 发起的支持请求中向指定 SUPPORT Operator 投影 provider、maskedHint、status、expiry 和 validation result；这不是 SupportGrant 私人正文权限。`SECURITY_ADMIN` 只有在精确 User/Profile 安全事件中才能 quarantine/revoke BYOK，不能解密、轮换或批量浏览。

解密不提供通用 `GET secret` 接口。只有 Model Gateway 在原子 claim 有效 `ModelExecutionPermit` 后可短暂解密精确 revision。Provider adapter 接收最小 typed credential view，调用完成后不能把它写回调用记录、错误或 trace。

## 6. Sub2API 参考边界

研究基于 Sub2API 官方仓库 commit [`93367b6d`](https://github.com/Wei-Shaw/sub2api/tree/93367b6db43315abe4f9fd9b09cbfc971b1f5ad0)。值得借鉴的是上游账号与下游用户 key 分离、配额/限流/IP ACL、认证缓存用 hash key、响应统一脱敏以及删除后的缓存失效广播。

但它不能作为 Sylis 的密钥安全模型：

- Provider credential 直接写入 `accounts.credentials` JSONB，[repository update](https://github.com/Wei-Shaw/sub2api/blob/93367b6db43315abe4f9fd9b09cbfc971b1f5ad0/backend/internal/repository/account_repo.go) 没有加密步骤；
- scheduler cache 会序列化完整 account（含 credentials）到 Redis，[实现见 scheduler cache](https://github.com/Wei-Shaw/sub2api/blob/93367b6db43315abe4f9fd9b09cbfc971b1f5ad0/backend/internal/repository/scheduler_cache.go)；
- 下游 `api_keys.key` 按原值查询和返回，[schema](https://github.com/Wei-Shaw/sub2api/blob/93367b6db43315abe4f9fd9b09cbfc971b1f5ad0/backend/ent/schema/api_key.go) 与响应遮罩并不等于加密；
- AES-256-GCM 实现主要服务 TOTP 等安全字段，[AES encryptor](https://github.com/Wei-Shaw/sub2api/blob/93367b6db43315abe4f9fd9b09cbfc971b1f5ad0/backend/internal/repository/aes_encryptor.go) 没有覆盖上述 Provider/User key，也没有统一的 per-record DEK 与 key-version 轮换。

因此 Sub2API 只作为功能参考，不作为依赖、不作为 credential broker，也不决定 Sylis 的表结构。Sylis v1 没有下游长期 API Key 产品面；未来若增加，也必须只保存带 server-side pepper 的不可逆 verifier，并在创建时只展示一次原值。

## 7. v1 限制

Railway sealed variables 不是 KMS/HSM：拥有变量修改权限的项目管理员和被攻陷的 Model Gateway 运行进程仍处于信任边界内，KEK 使用也没有外部 KMS 的逐次授权审计。v1 接受这一限制，以最小 service scope、预构建 image、MFA/re-auth、immutable audit、separate KEK、离线恢复副本和定期轮换降低风险；未来迁移到云 KMS 时保持 `kekVersion + encryptedDek` 契约不变。

## 8. 必测安全性质

- 数据库、Redis dump、日志、trace、错误和导出中找不到明文 key；
- AES-GCM nonce 不复用，AAD 篡改、ciphertext/tag 篡改和跨行替换都失败；
- profile owner XOR、User 隔离、Platform/User 列表隔离、Admin metadata-only 和无通用解密接口；
- revision 轮换不改写历史，正常 revoke 与 security quarantine 分离，restore role conjunction 生效，BYOK 不回退平台；
- KEK rewrap 支持中断恢复、并发 CAS、旧/新版本混读和最终旧 key 退役证明；
- secret scan 覆盖 git、image、Artifact、SSE、OpenAPI example 和测试 fixture。
