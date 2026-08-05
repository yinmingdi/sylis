# Identity and Access

本上下文描述独立 User 的认证、会话、同意与运营权限；一个 User 同时是登录和学习主体。

## Language

**User**:
独立注册、认证并拥有学习、阅读和 AI 数据的产品主体。
_Avoid_: Account, LearnerProfile, managed profile

**ConsentRecord**:
User 针对明确目的、数据种类、期限和政策版本作出的可追踪决定。
_Avoid_: consent boolean, terms accepted

**AuthSession**:
User 在一台客户端上的可撤销登录会话。
_Avoid_: JWT, token

**OperatorRole**:
授予后台职责集合的角色，例如内容审核或 release 管理；角色不等同于普通产品身份。
_Avoid_: isAdmin, super user
