# 独立 Admin 应用

## 1. 边界与部署

`@sylis/admin` 是独立 React/Vite 应用、独立 Railway service 和独立域名。它复用 design tokens、OpenAPI 生成基础设施和通用无障碍 primitives，但不复用 User Web 的 session、route tree、bundle 或 server-state cache。

Admin 只调用 `/api/admin/v1/**`。API 通过 `audience=ADMIN` AuthSession、固定 RBAC、资源状态和 re-auth 检查授权；隐藏菜单从来不是权限控制。

普通 User session 不能升级或交换为 Admin session。登录必须在 Admin origin 依次验证密码和已登记的 WebAuthn/TOTP，使用独立 `__Host-sylis_admin_session` 与 session-bound CSRF token；完整端点和失效规则见 [身份与独立用户](./identity-user.md)。

## 2. 信息架构

```text
/admin
/admin/builds
/admin/builds/:runId
/admin/review-batches
/admin/review-batches/:batchId
/admin/pedagogical-materials
/admin/pedagogical-materials/:candidateId
/admin/imports
/admin/imports/:jobId
/admin/lexicon-releases
/admin/deployments
/admin/ai-usage
/admin/source-rights
/admin/users/support
/admin/audit
```

首页是安静、密集的运营概览，显示阻断项、失败任务、待审核、高风险预算和当前 application/data release；不使用营销式卡片墙。

## 3. 前端边界

Admin 与 User Web 使用相同目录语义但不是同一个应用：`src/app`、lazy `src/pages`、`src/modules/<name>/{model,api,store?,components,index.ts}`、`src/assets` 和 `main.tsx`。它只依赖 `@sylis/admin-api-client`，该 client 由 `openapi-typescript + openapi-fetch` 从 Admin OpenAPI 3.1 snapshot 生成。

Admin 业务 module 固定为 `identity`、`dashboard`、`builds`、`reviews`、`materials`、`imports`、`lexicon-releases`、`deployments`、`ai-usage`、`source-rights`、`user-support`、`audit` 和 `jobs`。页面私有组件留在 `pages`；跨页面业务组件归对应 module；无领域 primitive 只从 `@sylis/components` 消费。完整目录、exports、依赖限制和测试见 [前端目录与模块边界](../implementation/frontend-structure.md)。

TanStack Query 是唯一 server-state cache，key 至少包含 operator `userId`、resource revision 和 filter；logout、role/session generation 变化或 MFA 失效时取消请求并清空整个 Admin QueryClient。Zustand 仅可保存未提交筛选布局等瞬时 UI，不保存 role、approval、Job 或 release 状态。

## 4. 页面职责

| 页面             | 主要能力                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Builds           | 创建 pilot/full BuildRun、查看 manifest、预算预测、stage、可恢复边界                             |
| Review batches   | 风险分层候选、evidence diff、审核决定、抽检失败率、batch gate                                    |
| Materials        | 按 kind/target/risk 查看正式事实、输入 evidence、blocks、mentions、citations、验证结果和生成成本 |
| Imports          | dry-run、start/resume、SSE progress、validation report                                           |
| Lexicon releases | DRAFT/VALIDATING/VALIDATED/RETIRED、active pointer、activation preview、rollback                 |
| Deployments      | commit/image/deployment ID、environment、health/smoke、rollback link                             |
| AI usage         | runtime/compiler 分账、quota、provider/model、schema failure、cost alerts                        |
| Source rights    | source version、license/rights status、attribution、removal impact                               |
| User support     | 最小账号状态、session revoke、请求处理；默认不显示私人正文                                       |
| Audit            | actor、role、action、target、before/after digest、request/deployment ID                          |

## 5. 高风险动作

以下动作要求 re-auth、理由、impact preview 和 audit；release 激活、回滚、source removal、角色授予和 retention policy 变更还要求第二个具备相应角色的 operator 批准：

1. 批准超出 pilot 的 AI BuildRun 预算；
2. override 自动 validation warning；ERROR 不可 override；
3. 激活或回滚 LexiconRelease；
4. 删除来源并触发新 artifact/release；
5. 查看或解密用户私人原文；
6. 变更 operator role、用户资格政策或数据留存策略。

双人审批记录两个独立 User、各自 re-auth time 和同一 action digest；同一人不能兼任两次批准。

## 6. 进度与错误

Build/Import/Generation 使用统一 Job projection 和 SSE。UI 同时展示 stage、真实 processed/total、吞吐、ETA 或 `estimating`、warnings、可恢复边界和最后 heartbeat；不能用不动的 spinner 代替进度。断线以 Last-Event-ID 恢复，terminal 状态提供可下载验证报告；内部 checkpoint state/ciphertext 不返回浏览器。

所有失败使用 RFC 9457 problem detail。Admin 显示稳定 code、requestId 和安全 detail；SQL、provider body、连接串、secret 和用户原文永远不进入 toast 或浏览器 telemetry。

## 7. 密钥边界

Admin 只能查看变量是否配置、scope、最后轮换时间和 health result，不能读取 Railway sealed secret 或 GitHub secret value。上传 source/private overlay 使用短效 upload URL 或受控 job input，不把本地绝对路径和凭据保存进 BuildRun manifest。

## 8. 验收

- ADMIN session 覆盖 password + WebAuthn、password + TOTP、challenge replay、role/MFA/password 变化后的即时撤销和 User cookie 混用拒绝。
- CSRF 覆盖 bootstrap、登录/re-auth 轮换、跨 origin、旧 token 和退出后重放。
- 每个 role 有 allow/deny contract test，直接请求与 UI 行为一致。
- 所有高风险动作覆盖 re-auth、双人审批、幂等、并发冲突和 audit 测试。
- SSE 覆盖刷新、断线、过期 cursor、重复事件和 terminal reconnect。
- PedagogicalMaterial 审核覆盖跨义项混合、无引用文化事实、伪词源助记、故事缺目标 mention、译文不一致和重复材料；operator 不能把 GENERATED evidence 改造成 source-backed evidence。
- desktop/tablet 支持大表格、筛选、键盘操作和屏幕阅读器；移动端只保证紧急查看与安全操作阻断，不压缩复杂审核工作流。
