# Identity and Access

本上下文描述独立 User 的认证、会话、同意与运营权限；一个 User 同时是登录和学习主体。Password/MFA credential 属于本上下文，Platform Provider credential 与 User BYOK 属于 Model Execution。

## Language

**User**:
独立注册、认证并拥有学习、阅读和 AI 数据的产品主体。
_Avoid_: Account, LearnerProfile, managed profile

**ConsentRecord**:
User 针对明确目的、数据种类、期限和政策版本作出的可追踪决定。
_Avoid_: consent boolean, terms accepted

**Authentication Credential**:
用于证明 User 身份的 Password、WebAuthn、TOTP 或 recovery credential；不包含 Provider API key。
_Avoid_: model credential, universal secret

**AuthSession**:
User 在一台客户端上的可撤销登录会话。
_Avoid_: JWT, token

**Operator**:
拥有至少一个有效 OperatorRole、通过 ADMIN audience 会话执行运营职责的 User；不是第二种用户或超级管理员。
_Avoid_: Admin user, staff account, superuser

**OperatorRole**:
授予 Operator 的固定、可组合职责集合；`ADMIN` 是 session audience 而不是 OperatorRole。
_Avoid_: isAdmin, ADMIN role, custom permission

**SupportGrant**:
由 owner User 向一个指定 SUPPORT Operator 授予的短期、可撤销、精确资源 revision 读取许可。
_Avoid_: support mode, account access, impersonation

**UserSecurityLock**:
`SECURITY_ADMIN` 因明确安全原因阻止账号继续建立或使用会话的可审计决定。
_Avoid_: edit user status, ban
