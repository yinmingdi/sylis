# 身份与独立用户

## 1. 领域边界

`User` 是 Sylis 唯一的注册、认证和学习主体。每个注册邮箱只创建一个独立 User；学习、阅读、AI、Notebook 和测评事实全部使用 `userId`。0.0.1 不提供家庭账号、子档案、监护关系、学习者切换或代他人操作。

身份安全数据仍与产品资料分表，避免把密码、会话和展示资料塞进一行，但这些表都属于同一个 User，不再创建第二个 learner identity。

## 2. 核心对象

| 对象                      | 核心字段                                                                                                                     | 规则                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `User`                    | id、status、displayName、timezone、securityVersion、createdAt、disabledAt                                                    | 唯一产品主体；安全变化递增 version                         |
| `UserEmail`               | userId、normalizedEmail、displayEmail、verifiedAt、isPrimary                                                                 | normalizedEmail unique；展示值分开                         |
| `PasswordCredential`      | userId、hash、algorithm、parameters、changedAt                                                                               | Argon2id；不存可逆密码                                     |
| `MfaCredential`           | userId、kind、status、label、verifiedAt、lastUsedAt                                                                          | WebAuthn/TOTP 的共同 identity；只有 VERIFIED 可认证        |
| `WebAuthnCredential`      | mfaCredentialId、credentialId、publicKey、signCount、transports                                                              | 不存私钥；验证 origin、RP ID、challenge 和 counter         |
| `TotpCredential`          | mfaCredentialId、secretCiphertext、keyVersion、algorithm/period                                                              | secret envelope encryption；二维码只在 enrollment 显示一次 |
| `MfaRecoveryCode`         | mfaCredentialId、codeHash、usedAt                                                                                            | 单次使用；不能替代 ADMIN session 的常规 MFA 要求           |
| `AuthenticationChallenge` | userId、audience、deviceNonceHash、passwordVerifiedAt、expiresAt、consumedAt                                                 | ADMIN 登录/re-auth 一次性状态                              |
| `ConsentRecord`           | userId、purpose、dataCategories、policyVersion、decision、time                                                               | 用户本人决定；append-only，撤回创建新事实                  |
| `AuthSession`             | userId、tokenHash、csrfTokenHash、audience、authStrength、securityVersion、mfaAuthenticatedAt、expires/idle/revoked/lastSeen | opaque token；安全 version 必须匹配                        |
| `OperatorRoleAssignment`  | userId、role、grantedByUserId、expiresAt                                                                                     | 后台职责与普通产品权限分开                                 |
| `SecurityAuditEvent`      | actorUserId、action、target、result、requestId、createdAt                                                                    | append-only；敏感值只存 hash/分类                          |

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
6. 角色授予前必须存在至少一个 VERIFIED WebAuthn/TOTP credential。`ADMIN` role 本身不绕过 MFA、re-auth 或双人审批。

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

| Role               | 能力                                              | 明确禁止                         |
| ------------------ | ------------------------------------------------- | -------------------------------- |
| `CONTENT_REVIEWER` | 查看 source candidate、提交内容审核               | 激活 release、查看用户私人内容   |
| `RELEASE_MANAGER`  | 验证、激活、回滚 LexiconRelease/DeploymentRelease | 修改 source fact、授予角色       |
| `SUPPORT`          | 查看最小用户状态、撤销 session、处理用户请求      | 查看聊天/答题原文、运行 importer |
| `ADMIN`            | 管理角色、策略和紧急安全操作                      | 绕过双人审批或删除审计           |

权限在 API command 层校验，repository 不接受前端传入的任意 role。Admin UI 隐藏按钮不是授权机制。

## 8. Admin 认证流程

| Method | Path                                           | 行为                                                                                       |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| POST   | `/api/admin/v1/auth/challenges`                | 验证密码并创建短效 MFA challenge；统一失败响应，不签 session                               |
| POST   | `/api/admin/v1/auth/sessions`                  | 消费 challenge + verified WebAuthn/TOTP assertion，设置 Admin cookie 并返回 CSRF bootstrap |
| GET    | `/api/admin/v1/auth/session`                   | 返回最小 actor/roles/authStrength/re-auth expiry 和轮换后的 CSRF token                     |
| DELETE | `/api/admin/v1/auth/session`                   | 撤销当前 ADMIN session、清 cookie 并写 audit                                               |
| POST   | `/api/admin/v1/auth/session/re-authentication` | 再次验证密码 + WebAuthn/TOTP，轮换 session/token 并记录短效 re-auth window                 |

challenge 绑定 user、ADMIN audience、origin、device nonce、允许 factor、过期时间和尝试次数；消费使用行锁保证一次性。只有当前仍持有 operator role、密码未变更且 factor 未撤销的 User 能完成登录。Admin session 每次请求都校验 User、role assignment、credential generation 和 session revoke generation，而不是只相信登录时的 role snapshot。

## 9. 留存与上线门禁

聊天、开放作答、阅读轨迹和 prompt/output 必须有 user owner、purpose、encryption key version、retention policy、export/delete state 和访问审计，不能复制到普通日志。产品要求的永久可识别留存与个人信息最短必要期限、撤回/删除规则存在冲突；文档允许建模，不允许在未取得适用法域书面结论前开放 production 注册。[个人信息保护法](https://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313088.html)
