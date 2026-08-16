# 前端目录与交互边界

## 1. 两个独立应用

`apps/frontends/web` 与 `apps/frontends/admin` 都是 React + Vite 应用，但拥有独立路由、audience、QueryClient、bundle、域名和 Railway service。它们只复用 `@sylis/components` primitives、`@sylis/utils` 纯函数和 `@sylis/api-client` 的对应 subpath。

不建立隐藏 Admin route，不共享 AuthSession/cache，不引入全局业务 store，也不使用 `features/ui/shared/network` 作为无所有权抽屉。

## 2. User Web 目录

```text
apps/frontends/web/
  src/
    main.tsx
    app/
      providers/
      router/
      layout/
      styles/
    pages/
      auth/
      home/
      lexicon/
      books/
      study/
      practice/
      assessments/
      notebooks/
      reading/
      agent/
      assets/
      settings/
    modules/
      identity/
      lexicon/
      books/
      learning/
      exercises/
      assessments/
      notebooks/
      reading/
      agent/
      assets/
    components/
      app-error-boundary.tsx
      route-loading.tsx
    utils/
    assets/
  test/
```

`pages` 只组合路由页面；`modules` 持有领域 UI、query/mutation hooks、schema 和公开 `index.ts`；顶层 `components` 只放本应用跨页面但无领域 owner 的组合件。模块专用组件留在模块内。顶层 `utils` 只放 Web-only 纯函数；跨 runtime 纯函数进入 `@sylis/utils`。

## 3. Learning Agent 前端

正式路由：

```text
/agent
/agent/sessions/:id
```

`modules/agent`：

```text
modules/agent/
  api/
    queries.ts
    commands.ts
    event-stream.ts
  model/
    event-reducer.ts
    block-projection.ts
    block-renderer-registry.ts
    composer-state.ts
    artifact-selection.ts
    plan-projection.ts
    asset-selection.ts
  components/
    session-list.tsx
    event-timeline.tsx
    message-composer.tsx
    run-status.tsx
    run-plan.tsx
    blocks/
      rich-text-block.tsx
      code-block.tsx
      table-block.tsx
      tool-call-block.tsx
      artifact-block.tsx
      proposal-block.tsx
      state-reference-block.tsx
    asset-uploader.tsx
    asset-processing-status.tsx
    tool-call.tsx
    wait-condition.tsx
    proposal-review.tsx
    artifact-inspector.tsx
  index.ts
```

桌面 workspace 使用稳定三栏：Session 列表、Event/Message/Composer、Artifact/Approval inspector。移动端全屏，inspector 使用独立层。全局 Agent 按钮从词典、阅读、练习和 Notebook 打开带显式 context refs 的侧栏；User 提交前可查看和移除共享内容。

删除孤立 Tutor、Grammar 和 AI Reading 页面，它们不再有自己的 session/store/client。原入口通过 Capability 和 context refs 进入 Agent。

`block-projection.ts` 是 Session SSE 的唯一 Block reducer：以 event sequence 去重、以 `blockId` 保持 identity，并按 message/parent/position 投影 closed `AgentMessageBlock` union。`block-renderer-registry.ts` 必须对每个 kind 完整匹配；未知 kind/schema 显示安全占位，不能动态加载 Provider 指定组件或使用 raw HTML。Block renderer 是 `modules/agent` 的领域 UI，不进入 `@sylis/components`。

## 4. Admin 目录

```text
apps/frontends/admin/
  src/
    main.tsx
    app/{providers,router,layout,styles}/
    pages/
      identity/
      overview/
      source-datasets/
      rights-decisions/
      build-runs/
      reviews/
      publish-runs/
      lexicon-releases/
      agent-runs/
      agent-releases/
      provider-routes/
      credentials/
      ai-usage/
      assets/
      jobs/
      user-support/
      operator-roles/
      deployments/
      audit/
    modules/
      identity/
      overview/
      source-datasets/
      rights-decisions/
      build-runs/
      reviews/
      publish-runs/
      lexicon-releases/
      agent-runs/
      agent-releases/
      provider-routes/
      credentials/
      ai-usage/
      assets/
      jobs/
      user-support/
      operator-roles/
      deployments/
      audit/
    components/
    utils/
    assets/
```

Admin navigation 按 Overview、Lexicon、Agent & Models、Assets & Jobs、Users & Security、Deployments 分组。`Imports`、独立 `Materials` 和 `Runtime AI` module 不存在：发布流程使用 `publish-runs`，教学材料/练习 candidate 进入 typed Review Center，AI 停止与恢复通过 Capability/Route/Credential/Budget policy 表达。

Admin 默认只显示 redacted status、cost、hash、policy 和 error code。需要普通 User 内容支持时必须显示指定 SUPPORT Operator、SupportGrant resource revision、purpose 和 expiry，并由 API 再次在线校验。SupportGrant 不能使用通配；ModelExchange、BYOK、hidden reasoning、system prompt 和 Provider raw body 始终不可见，Agent 排障只读取 User 确认的 DiagnosticBundleRevision。前端 route guard 不是权限真相。

列表筛选、cursor 和选中项进入 URL，detail 使用独立 route；Review Center 可在 desktop 使用 master/detail inspector，但 detail route 必须可复制和恢复。高风险 dialog 展示服务端 impact preview、所需角色、policy version 和 target digest，并收集结构化 reason/re-auth，不接受客户端构造 actor、role 或 before state。

## 5. State 规则

- TanStack Query 是 server-state 唯一 cache；query key 包含 user/audience、release 或 session/run identity。
- URL 保存可分享的 filter、selected session/artifact 和分页状态。
- React local state 保存表单和短期交互。
- 只有跨远距组件、纯客户端且生命周期明确的状态才允许 Zustand；不得复制 server entity。
- Agent stream 以 `AgentEvent.sequence` reducer 投影，snapshot 返回当前 Message/Block tree；完成后由 Query invalidation 获取关系真相，delta 不直接成为永久 cache。
- SSE 断线使用 `Last-Event-ID` 恢复；Redis/API 重连不会创建新 Run。
- Composer 只提交 `/instructions`；上传状态来自 ContentAsset projection，未 READY revision 不能进入 composer context。

## 6. API 与错误

Web 只导入 `@sylis/api-client/user` 与 `./agent`，Admin 只导入 `./admin`。生成 client 将 transport DTO 映射到 module model；页面不手写 fetch URL 或解析 provider payload。

统一错误至少区分 validation、unauthenticated、forbidden、conflict、rate limit、credential failure、wait required、not found 和 transient unavailable。BYOK 失败显示 provider/credential 状态且不暗示已回退平台额度。

## 7. Components 与练习 renderer

`@sylis/components` 只提供 Button、IconButton、Dialog、Menu、Tabs、Tooltip、Input、Select、Toggle、Progress、Table 等无领域 primitives，不包含 WordCard、AgentMessage、AgentMessageBlock、ExerciseQuestion 或 Admin approval。

练习 UI 按 response contract 选择 renderer：`CHOICE`、`SHORT_TEXT`、`EXTENDED_TEXT`、`NO_CAPTURE`。`ExerciseTaskKind` 决定认知任务和文案，不决定具体组件；`MATCHING`、`TOKEN_ASSEMBLY`、`AUDIO_RECORDING` 未进入 v1 时不显示占位入口。

## 8. 安全与可访问性

- HttpOnly cookie 不进入 JavaScript；所有写操作带 CSRF 与幂等键。
- 富文本、Web/tool output 和 Agent content 均视为不可信，使用受控 renderer 和 URL scheme allowlist。
- 文件选择器执行格式/大小的客户端早期提示，但服务端 magic-byte、malware 和结构校验才是权限真相；不渲染 quarantine object URL。
- Proposal 显示目标、影响、action digest 摘要、可撤销性和 expiry，批准按钮不能在参数变化后继续有效。
- streaming region 使用合理 `aria-live`，不会逐 token 打断屏幕阅读器；键盘可完成 composer、timeline 和 inspector 工作流。
- 固定尺寸工具栏、按钮、练习响应和三栏布局有响应式约束，动态状态不造成重排或遮挡。

## 9. 完成条件

- 两个 frontend 无 session、router、QueryClient 或业务 store 共享。
- 所有页面只通过 module public interface 和生成 client 消费业务能力。
- 独立 Tutor/Grammar/AI Reading route 和状态被删除，Agent workspace 覆盖其入口。
- `components` 与 `utils` 没有领域、I/O、provider 或数据库逻辑。
- desktop/mobile Agent、visible plan、上传/处理、四种练习响应、断线恢复、等待/批准和权限错误通过 Playwright 与视觉检查。
