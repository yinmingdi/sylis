# 身份与独立用户

## 1. 领域边界

`User` 是 Sylis 唯一的注册、认证和学习主体。每个注册邮箱只创建一个独立 User；学习、阅读、AI、Notebook 和测评事实全部使用 `userId`。0.0.1 不提供家庭账号、子档案、监护关系、学习者切换或代他人操作。

身份安全数据仍与产品资料分表，避免把密码、会话和展示资料塞进一行，但这些表都属于同一个 User，不再创建第二个 learner identity。

Password/MFA credential 属于 Identity；Platform Provider credential 与 User BYOK 不属于 Identity，而由 Model Gateway 的 `CredentialProfile/Revision` 管理。Identity 只证明当前 User、MFA/re-auth 和 consent，不持久化或解密 Provider secret。

## 2. 核心对象

| 对象                      | 核心字段                                                                                                                             | 规则                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `User`                    | id、status、displayName、timezone、securityVersion、createdAt、disabledAt                                                            | 唯一产品主体；安全变化递增 version                         |
| `UserEmail`               | userId、normalizedEmail、displayEmail、verifiedAt、isPrimary                                                                         | normalizedEmail unique；展示值分开                         |
| `PasswordCredential`      | userId、hash、algorithm、parameters、changedAt                                                                                       | Argon2id；不存可逆密码                                     |
| `MfaCredential`           | userId、kind、status、label、verifiedAt、lastUsedAt                                                                                  | WebAuthn/TOTP 的共同 identity；只有 VERIFIED 可认证        |
| `WebAuthnCredential`      | mfaCredentialId、credentialId、publicKey、signCount、transports                                                                      | 不存私钥；验证 origin、RP ID、challenge 和 counter         |
| `TotpCredential`          | mfaCredentialId、secretCiphertext、keyVersion、algorithm/period                                                                      | secret envelope encryption；二维码只在 enrollment 显示一次 |
| `MfaRecoveryCode`         | mfaCredentialId、codeHash、usedAt                                                                                                    | 单次使用；不能替代 ADMIN session 的常规 MFA 要求           |
| `AuthenticationChallenge` | userId、audience、deviceNonceHash、passwordVerifiedAt、expiresAt、consumedAt                                                         | ADMIN 登录/re-auth 一次性状态                              |
| `ConsentRecord`           | userId、purpose、dataCategories、policyVersion、decision、time                                                                       | 用户本人决定；append-only，撤回创建新事实                  |
| `AuthSession`             | userId、tokenHash、csrfTokenHash、audience、authStrength、securityVersion、mfaAuthenticatedAt、expires/idle/revoked/lastSeen         | opaque token；安全 version 必须匹配                        |
| `SupportGrant`            | userId、supportUserId、resource kind/id/revision、purpose、actionDigest、expires/revoked time                                        | exact-resource；默认 2h、最长 24h；每次读取在线校验        |
| `OperatorRoleAssignment`  | userId、role、source、grantedByUserId、reason、policyVersion、expires time、revokedByUserId/revocationReason/revokedAt、actionDigest | 七种固定职责可组合；正常命令禁止 self-change               |
| `OperatorBootstrapState`  | completedAt、operatorUserId、actionDigest                                                                                            | 只允许零 Operator 状态消费一次                             |
| `UserSecurityLock`        | userId、reasonCode、createdByUserId、createdAt、releasedAt、actionDigest                                                             | 只由 SECURITY_ADMIN 创建；不用直接改 User 字段冒充流程     |
| `SecurityAuditEvent`      | actorUserId、session/role、action、target revision、result、requestId、digest、createdAt                                             | append-only；敏感值只存 hash/分类                          |
| `DataAccessAuditEvent`    | actorUserId、ownerUserId、SupportGrant/resource、purpose、result、createdAt                                                          | append-only；记录每次私人资源读取                          |

## 3. 会话模型

User Web 通过同源网关访问 `/api`。浏览器只接收 `__Host-sylis_session`，生产设置 `Secure; HttpOnly; SameSite=Lax; Path=/` 且不设置 Domain。服务端 session ID 至少 128 bit 随机，数据库只保存 token hash。[OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

所有 POST/PUT/PATCH/DELETE 要求 session-bound CSRF token、自定义 header、Origin 和 Fetch Metadata 校验；GET/HEAD 不得写状态。登录、密码更新、角色变化和可疑设备事件轮换 session；退出、改密、用户禁用和管理员撤销立即失效。

Admin 域名使用独立 `audience=ADMIN` 会话和 `__Host-sylis_admin_session`，不能读取、接受或升级 User Web cookie。ADMIN session 只有在同一次短效 challenge 中验证密码和一个已验证 WebAuthn/TOTP factor 后签发，`authStrength=PASSWORD_MFA` 并记录 `mfaAuthenticatedAt`。recovery code 只用于恢复 factor，不直接签发 ADMIN session。

每个 session 生成独立 CSRF secret，数据库只保存 hash。登录成功和 `GET /api/admin/v1/auth/session` bootstrap 返回可放入内存的 CSRF token；mutation 通过 header 回传。登录、re-auth、权限变化和高风险动作后轮换 token，旧 token 立即失效。User Web 与 Admin Web 的 cookie、CSRF token、origin allowlist 和 cache 完全分开。

## 4. MFA enrollment 与恢复

1. User 先以密码重新认证，服务端创建短效、单次 MFA enrollment challenge。
2. WebAuthn 只接受配置的 HTTPS Admin/User origin、RP ID、user verification policy 和支持算法；credential ID 全局唯一。
3. TOTP secret 在服务端生成并加密，只有提交一个有效 code 后才把 credential 标为 VERIFIED；明文 secret 不再返回。
4. recovery codes 使用 CSPRNG 生成，只显示一次并逐条保存慢 hash；使用后撤销该 code，并要求重新登记 WebAuthn/TOTP 才能创建 ADMIN session。
5. 新增/删除 factor、密码变更、User disable 或角色 grant/revoke 都撤销该 User 的全部 ADMIN session；删除最后一个 verified factor 时先移除 operator role 或阻止操作。
6. 角色授予前必须存在至少一个 VERIFIED WebAuthn/TOTP credential。`ADMIN` 只是 session audience，不是 role；任何 OperatorRole 都不绕过 MFA、re-auth、资源状态或版本化 command policy。

## 5. 用户流程

1. 注册 challenge 对外返回统一结果，避免邮箱枚举；code 只保存 hash、尝试次数和短过期。
2. 注册事务创建 User、verified primary email、PasswordCredential、默认 Notebook 和首个 USER AuthSession。
3. 登录失败使用统一 401、按 user/IP/device 风险限流，不暴露用户是否存在。
4. 密码重置 token 单次使用，成功后撤销其他 session 并写 audit。
5. 用户可以列出、命名和撤销自己的设备 session。
6. 数据导出使用异步 Job；下载链接短效、单次、受重新认证保护。
7. 删除请求记录处理状态和适用的 retention/legal hold；不能用删除 User 行破坏 append-only 安全、账务或发布审计。

## 6. 产品年龄范围

0.0.1 不存 birth date、age band、child flag、Household 或 GuardianRelationship，也不提供儿童专属 capability。产品上线时通过适用地区的服务资格与注册政策确定可注册人群；在没有独立法律和监护设计前，不宣称支持需要监护人代为同意或管理的儿童用户。

## 7. 固定 RBAC

`ADMIN` 是 AuthSession audience；后台业务角色固定为七种、可以组合：

| Role                    | 职责                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `SUPPORT`               | 最小 User 状态、session revoke、export/deletion request 与 exact-resource SupportGrant |
| `CONTENT_REVIEWER`      | CandidateRevision、人工审核、风险抽样与 validation WARN acceptance                     |
| `LEXICON_OPERATOR`      | SourceDatasetVersion、RightsDecision、BuildRun 与 PublishRun                           |
| `RELEASE_MANAGER`       | LexiconRelease activation/rollback                                                     |
| `MODEL_OPERATOR`        | Platform Credential 正常生命周期、BudgetPolicy/QuotaPolicy 与模型成本治理              |
| `AGENT_RELEASE_MANAGER` | Capability/Skill/Eval release 的批准、promotion 与普通 rollback                        |
| `SECURITY_ADMIN`        | 角色、审计、用户安全锁定、留存与紧急 quarantine/revoke                                 |

角色到 command 的映射是 code-owned、deny-by-default policy，不允许 Admin 动态创建 permission。部分高风险 command 要求同一 Operator 同时持有两个角色；v0.0.1 的 quorum 为一个具备全部所需角色的人，未来多人规则通过新 ApprovalPolicy version 发布。

普通 RoleAssignment 默认 90 天、最长 1 年。每条有效 RoleAssignment 都要求至少一个 `VERIFIED`、未禁用且具有与 kind 精确匹配的 WebAuthn/TOTP typed child 的 MFA credential；移除、禁用或重新绑定最后一个可用 factor 必须失败。`SECURITY_ADMIN` 不能通过普通 Admin command 修改自身角色，也不能移除最后一个有效 SECURITY_ADMIN。任何 grant/renew/revoke 都要求近期 re-auth、reason、action digest 和 audit；角色、密码、MFA 安全状态或安全材料变化立即撤销受影响 User 的全部 ADMIN session，普通 `lastUsedAt`/WebAuthn `signCount` 更新不撤销。完整矩阵见[独立 Admin 运营控制台](./admin.md)。

## 8. Admin 认证流程

| Method | Path                                           | 行为                                                                                       |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| POST   | `/api/admin/v1/auth/challenges`                | 验证密码并创建短效 MFA challenge；统一失败响应，不签 session                               |
| POST   | `/api/admin/v1/auth/sessions`                  | 消费 challenge + verified WebAuthn/TOTP assertion，设置 Admin cookie 并返回 CSRF bootstrap |
| GET    | `/api/admin/v1/auth/session`                   | 返回最小 actor/roles/authStrength/re-auth expiry 和轮换后的 CSRF token                     |
| DELETE | `/api/admin/v1/auth/session`                   | 撤销当前 ADMIN session、清 cookie 并写 audit                                               |
| POST   | `/api/admin/v1/auth/session/re-authentication` | 再次验证密码 + WebAuthn/TOTP，轮换 session/token 并记录短效 re-auth window                 |

challenge 绑定 user、ADMIN audience、origin、device nonce、允许 factor、过期时间和尝试次数；消费使用行锁保证一次性。只有当前仍持有 operator role、密码未变更且 factor 未撤销的 User 能完成登录。Admin session 每次请求都校验 User、role assignment、credential generation 和 session revoke generation，而不是只相信登录时的 role snapshot。

Admin browser 只访问 `admin-api`；Identity 仍是 User、AuthenticationChallenge、AuthSession、SupportGrant 和 OperatorRoleAssignment 的 transaction owner。`admin-api` 通过受限 internal command/query interface 创建、验证或撤销 ADMIN session 和 Identity 资源，不能建立第二份 Admin 用户表，也不能直接更新 owner 表。

## 9. Bootstrap 与恢复

系统不提供默认 Admin 账号或密码。一次性离线 bootstrap 只在数据库不存在 RoleAssignment 时运行，目标必须是已经正常注册且持有 VERIFIED WebAuthn/TOTP 的 User。命令在一个事务中创建七条显式长期 RoleAssignment、OperatorBootstrapState 和 SecurityAuditEvent；成功后永久 consumed，重复运行失败。

只有系统不存在有效 SECURITY_ADMIN 时，受保护的离线 recovery command 才能为一个已完成 MFA 的 User 恢复一条 SECURITY_ADMIN assignment。它不能授予其他角色，必须记录环境、reason、action digest 与审计，并在完成后轮换或删除 break-glass secret。

## 10. 留存与上线门禁

Agent 内容、开放作答、阅读轨迹和模型 input/output 必须有 User owner、purpose、encryption key version、retention policy、export/delete state 和访问审计，不能复制到普通日志。基础聊天保留 User message 与 final answer；optional normalized exchange 只有在明确 consent 后保留，撤回后立即隐藏并在 30 天内 purge。Hidden reasoning、system prompt 和 Provider raw body 永不保存。

User 内容删除后立即从产品查询隐藏并在 30 天内 hard purge。Admin 默认只能看 redacted metadata；普通私人内容的 Support 读取要求 User 创建绑定指定 SUPPORT Operator、精确 resource revision、purpose 与 2h default/24h max expiry 的 SupportGrant。允许的资源仅为 ReadingDocumentRevision、ContentAssetRevision、CollectedLexicalItemRevision、ExerciseAttemptTextArtifact 和 User 预览确认的 DiagnosticBundleRevision；每次读取都创建 DataAccessAuditEvent。

SupportGrant 永不解锁 AgentSession、ModelExchange、BYOK、hidden reasoning、system prompt、Provider raw body 或 Credential ciphertext。Agent 排障必须由 User 生成可预览、编辑和脱敏的 DiagnosticBundleRevision。详见 ADR 0015、[凭证管理](../architecture/credential-management.md) 与[文件和模型交换](../architecture/agent-files-and-exchanges.md)。
