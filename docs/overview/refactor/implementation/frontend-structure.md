# 前端目录与模块边界

## 1. 目的与适用范围

本文是 `apps/web` 与 `apps/admin` 的目标代码结构规范。两者都是 React + Vite 应用，共用目录语义和无领域 UI 基础，但拥有独立路由、会话、OpenAPI client、QueryClient、bundle 与 Railway service。

目标结构不保留旧 `features`、`ui`、`shared`、`network` 或全局 `stores` 目录。当前没有生产用户，迁移采用一次性替换，不建立旧 DTO adapter、双 route 或双状态源。

## 2. User Web 完整目标树

```text
apps/web/
  project.json
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/
    app/
      router/
        routes.tsx
        guards.tsx
      providers/
        app-providers.tsx
        query-provider.tsx
      layout/
        app-shell.tsx
        primary-navigation.tsx
      session/
        session-bootstrap.ts
      errors/
        app-error-boundary.tsx
      styles/
        index.css
    pages/
      auth/
        login-page.tsx
        register-page.tsx
        verify-page.tsx
      study/
        today-page.tsx
        books-page.tsx
        book-edition-page.tsx
        objective-page.tsx
        assessment-page.tsx
        assessment-session-page.tsx
        assessment-result-page.tsx
      lexicon/
        search-page.tsx
        headword-page.tsx
        entry-page.tsx
      ai/
        tutor-page.tsx
        tutor-session-page.tsx
        grammar-page.tsx
      explore/
        explore-page.tsx
        reddit-page.tsx
        subreddit-page.tsx
        reddit-post-page.tsx
        ai-reading-page.tsx
        reading-document-page.tsx
      reading/
        history-page.tsx
        saved-page.tsx
      notebooks/
        notebook-page.tsx
      me/
        me-page.tsx
        consents-page.tsx
        sessions-page.tsx
        data-page.tsx
      not-found-page.tsx
    modules/
      identity/
      lexicon/
      books/
      study/
      exercises/
      assessments/
      notebooks/
      reading/
      reddit/
      ai-tutor/
      jobs/
    assets/
      images/
      fonts/
    main.tsx
  test/
    architecture/
    integration/
    e2e/
```

每个业务 module 按需要使用以下内部形状，不创建空目录：

```text
modules/<name>/
  model/          浏览器领域 view model、表单 schema、query key
  api/            query/mutation options、OpenAPI DTO 到 view model 的映射
  store/          可选；真正跨页面的临时浏览器状态
  components/     可跨页面复用且属于本业务的 React 组件
  index.ts        唯一公开入口
```

页面私有组件、hook 和局部状态与页面共置：

```text
pages/study/objective/
  objective-page.tsx
  objective-progress.tsx
  use-objective-navigation.ts
```

只有被同一业务的两个以上页面复用的实现才上移到 `modules/<name>/components`。只在一个页面出现的组件不得为了“看起来通用”提前上移。

## 3. Admin 完整目标树

```text
apps/admin/
  project.json
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/
    app/
      router/
      providers/
      layout/
      session/
      errors/
      styles/
    pages/
      identity/
      dashboard/
      builds/
      reviews/
      materials/
      imports/
      lexicon-releases/
      deployments/
      ai-usage/
      source-rights/
      user-support/
      audit/
      jobs/
      not-found-page.tsx
    modules/
      identity/
      dashboard/
      builds/
      reviews/
      materials/
      imports/
      lexicon-releases/
      deployments/
      ai-usage/
      source-rights/
      user-support/
      audit/
      jobs/
    assets/
    main.tsx
  test/
    architecture/
    integration/
    e2e/
```

Admin module 使用与 User Web 相同的 `model/api/store?/components/index.ts` 规则，但不能导入 `apps/web/src/**`。Admin 只使用 `@sylis/admin-api-client`；User Web 只使用 `@sylis/api-client`。

## 4. `components` 与 `utils` 的归属

`components` 是正确术语，但必须按所有权分层，而不是建立新的全局杂物目录。

| 位置                        | 放什么                                                   | 不放什么                                             |
| --------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| 页面内 `pages/**`           | 只为该页面服务的布局、控件、hook                         | 跨页面业务规则、通用 primitive                       |
| `modules/<name>/components` | 属于该业务且被多个页面复用的组件                         | Button/Input 等无领域 primitive                      |
| `packages/components`       | tokens、icons、styles、无领域 React primitive 和组合控件 | lexicon/study/admin 业务请求、query、权限判断        |
| `packages/utils`            | 跨 Node/browser runtime 的纯函数                         | React hook、DOM helper、API client、领域归一化或密钥 |
| module/page 内 `*.utils.ts` | 只服务该 owner 的纯辅助逻辑                              | 为逃避边界而复用的跨领域代码                         |

目标 UI package：

```text
packages/components/
  project.json
  package.json
  src/
    tokens/
    icons/
    styles/
    primitives/
      button/
      input/
      form-field/
      dialog/
      menu/
      tabs/
      table/
      progress/
      feedback/
    composites/
    testing/
    index.ts
```

`@sylis/components` 的 root `index.ts` 只导出稳定 public API。应用不得 deep import `@sylis/components/src/**`。Storybook 位于 `docs/components`，它是 package consumer 和可视化测试载体，不拥有生产组件。

`@sylis/utils` 只接受确定性、无 I/O、无框架、无业务 owner 的函数，例如安全的字符串/集合操作。词形归一化归 compiler，query key 归 module，CSRF/idempotency/SSE transport 归生成 client 的装配层，不能塞进 `utils`。

## 5. 模块所有权与公开接口

| User Web module | 所有权                                             | `index.ts` 可导出                                            |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| `identity`      | session view、登录/注册/consent/device 交互        | 页面所需 query/mutation options、actor view、业务组件        |
| `lexicon`       | search、Headword/Entry/Sense/material view         | typed query options、详情组件、typed target picker           |
| `books`         | 词书与 immutable edition 浏览                      | book query options、edition summary                          |
| `study`         | today plan、enrollment、Objective、Review 提交流程 | study query/mutation options、objective summary              |
| `exercises`     | response renderer、attempt 提交、反馈              | `ExercisePlayer`、response registry、attempt mutations       |
| `assessments`   | blueprint/session/result                           | assessment queries、session progress/result components       |
| `notebooks`     | typed lexical target collection                    | notebook queries/mutations、collection control               |
| `reading`       | document revision、annotation、activity/saved      | reading queries、document/annotation components              |
| `reddit`        | Reddit feed/comment/source-specific view           | reddit queries、feed/comment components                      |
| `ai-tutor`      | tutor/grammar/generation browser workflow          | AI queries/mutations、stream view、grammar result components |
| `jobs`          | Job projection、SSE subscription、terminal state   | job query keys、event subscription、progress components      |

Admin 对应 module 只拥有其运营用例。`jobs` 提供统一进度投影；`builds`、`imports` 等模块持有各自业务操作，不复制 BackgroundJob 状态机。

公开入口只能导出消费方需要的类型、factory 和组件，不导出 module 内部 endpoint path、raw generated DTO、store 实例、cache 或 private component。跨 module 协作优先组合公开 view/query API；若共享的是稳定业务概念，应由后端 HTTP contract 提供，而不是在前端建立第二套领域模型。

## 6. 允许与禁止依赖

允许方向：

```text
main -> app -> pages -> modules -> api-client/components/utils
app -----------> api-client/components/utils
pages ---------> components/utils
```

- `app` 负责 composition，不拥有业务规则。
- `pages` 可以导入多个 module 的 `index.ts` 完成页面编排。
- module 可导入自己的内部文件、对应生成 client、`@sylis/components` 和 `@sylis/utils`。
- 同一应用的 module 只有在明确业务依赖时才通过对方 `index.ts` 导入；循环依赖直接失败。

禁止：

- `modules` 导入 `pages` 或 `app`。
- `@sylis/components`、`@sylis/utils`、生成 client 导入任何 app 源码。
- User Web 导入 Admin app/client，或 Admin 导入 User Web/app client。
- deep import 其他 module 的 `api/model/store/components`。
- 在 Zustand/Context 保存 server response 副本；TanStack Query 是唯一 server-state cache。
- 在组件内直接 `fetch`、拼 endpoint 或读取 HttpOnly cookie。
- 浏览器依赖 `@sylis/database`、`@sylis/background-jobs` executor、compiler、importer、Prisma 或 AI provider adapter。
- 通过 `@sylis/shared` 聚合 DTO；该 package 在迁移中删除。

Nx 对 project 级边界执行 tag 规则；ESLint restricted imports 和 architecture tests 对 app 内 `app/pages/modules` 层级与 module public API 执行规则。每个 frontend module 不单独建 Nx project。

## 7. 状态与数据访问规则

- TanStack Query query options factory 与 key factory 位于 module `api`/`model`，组件不临时发明 key。
- User key 至少包含真实 `userId`；词典 key 包含 `lexiconReleaseId`；revisioned resource 包含 revision。
- mutation 统一通过生成 client 装配层注入 CSRF 与 idempotency key。
- Zustand `store/` 只在状态确实跨页面、无需服务端持久化且不能由 URL/query state 表达时创建。
- 页面局部输入优先 React state/form library；筛选和分页优先 URL search params；服务端事实只进 Query cache。
- SSE 由 `jobs` 或 `ai-tutor` module 封装断线恢复与 event ID，页面不自行维护第二套 terminal state。

## 8. 当前路径迁移映射

### 8.1 应用壳与通用实现

| 当前路径                                      | 目标                                                 | 动作                                               |
| --------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| `src/main.tsx`, `src/index.ts`                | `src/main.tsx` + 各 module/package `index.ts`        | 只保留一个应用入口；删除全应用 barrel              |
| `src/App.tsx`, `router/**`, `layout/**`       | `src/app/router`, `src/app/layout`                   | 重建 route tree 与四入口 shell                     |
| `src/network/**`                              | `@sylis/api-client` composition + module `api`       | 删除手写 transport/DTO                             |
| `src/styles/**`                               | app styles + `@sylis/components/styles`              | tokens/primitives 上移，应用布局留 app             |
| `src/assets/**`, `public/**`, `vite-env.d.ts` | `src/assets`/`public`/构建声明                       | 按是否需要 import/hash 保留，不把 source dump 打入 |
| `src/__test__/**`                             | `test/integration` 或对应源码 `*.spec.tsx`           | 按 owner 迁移，删除只验证旧 contract 的测试        |
| `src/hooks/useTheme.ts`                       | `src/app/providers` 或 `@sylis/components` theme API | 按是否跨 app 使用决定                              |
| `src/hooks/useClickOutside.ts`                | `@sylis/components` 内对应 primitive                 | 与组件一起测试，不留全局 hook 杂物箱               |
| `src/hooks/useGlobalWordInteraction.ts`       | `modules/lexicon` + `modules/reading` public APIs    | 拆 resolve/selection 用例，不保留跨业务全局 hook   |
| `src/hooks/useWordCollection.ts`              | `modules/notebooks`                                  | 使用 typed lexical target mutation                 |
| `src/utils/setRem.ts`                         | 删除或 app styles                                    | 不以 JS viewport 字号缩放代替响应式 CSS            |
| `src/utils/audioConverter.ts`                 | 删除                                                 | v1 无录音、上传、ASR                               |
| `src/sync-engine/**`                          | 删除                                                 | `0.0.1` online-first                               |
| `src/stores/**`                               | 对应 module `store/` 或删除                          | server data 全部迁 Query cache                     |

### 8.2 业务 API 与状态

| 当前路径                                 | 目标 module           |
| ---------------------------------------- | --------------------- |
| `src/modules/user/**`                    | `modules/identity`    |
| `src/modules/vocabulary/api/words.ts`    | `modules/lexicon`     |
| `src/modules/vocabulary/api/test.ts`     | `modules/assessments` |
| `src/modules/vocabulary/api/notebook.ts` | `modules/notebooks`   |
| `src/modules/books/**`                   | `modules/books`       |
| `src/modules/learning/**`                | `modules/study`       |
| `src/modules/articles/**`                | `modules/reading`     |
| `src/modules/reddit/**`                  | `modules/reddit`      |
| `src/modules/ai/**`, `modules/chat/**`   | `modules/ai-tutor`    |

### 8.3 组件

| 当前组件组                                                                   | 目标                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `components/button`, `input`, `form*`, `card`, `scroll-view`, `theme-toggle` | 审核后迁 `@sylis/components`，去除业务/应用依赖              |
| `components/app-bar`, `page-header`, `quick-toolbar`, `sliver-app-bar`       | app layout、页面私有组件或 components primitive，按 owner 拆 |
| `components/word-detail*`, `word-header`                                     | `modules/lexicon/components`，改为 Entry/Sense/material 层级 |
| `components/word-search`, `word-selector`, `word-list*`                      | `modules/lexicon/components`                                 |
| `components/books`                                                           | `modules/books/components`                                   |
| `components/word-quiz-*`, `word-recognition`, `word-spelling`                | `modules/exercises/components` response renderer             |
| `components/chat/**`, `grammar-analysis`, `article-generator`                | `modules/ai-tutor/components`                                |
| `components/interactive-text/**`                                             | `modules/reading/components`；纯 token primitive 可再下沉    |
| `components/user-avatar`                                                     | `modules/identity/components` 或无业务时迁 components        |
| `components/view`, `virtual-popover`, `underline-actions`                    | 审核后迁 `@sylis/components`                                 |
| `components/sound-button`, `utils/audioConverter.ts`                         | 删除旧语音实现；只保留 release-backed playback primitive     |

### 8.4 页面

| 当前页面族                     | 目标 pages/module                                |
| ------------------------------ | ------------------------------------------------ |
| `pages/vocabulary/**`          | `pages/study/**` + study/exercises module        |
| `pages/common/word-detail/**`  | `pages/lexicon/**` + lexicon module              |
| `pages/common/books/**`        | `pages/study/**` + books module                  |
| `pages/me/test*`               | `pages/study/assessment*` + assessments module   |
| `pages/common/articles/**`     | `pages/explore`/`pages/reading` + reading module |
| `pages/explore/reddit/**`      | `pages/explore/**` + reddit/reading modules      |
| `pages/ai/**`                  | `pages/ai/**` + ai-tutor/jobs modules            |
| `pages/auth/**`, `pages/me/**` | auth/me pages + identity module                  |
| `pages/common/404/**`          | `pages/not-found-page.tsx`                       |

## 9. 测试与门禁

- `modules/**/model` 与 DTO mapper 使用 unit test，覆盖 discriminated union、缺失状态和 query key。
- generated client 对 OpenAPI snapshot 做 contract test；生成 diff 必须干净。
- module 级 integration test 使用 Mock Service Worker 或等价 HTTP boundary，不 mock 内部 hook 实现。
- Playwright 覆盖 User Web 四入口、所有 response renderer、session 切换、SSE 恢复和 release 切换；Admin 覆盖 RBAC、re-auth、审批与大表格。
- Storybook/视觉回归覆盖 `@sylis/components` 的状态、键盘、长文本、窄 viewport 和 reduced motion。
- axe 或等价自动检查与人工键盘流程共同作为 accessibility gate。
- architecture test 失败条件：跨 app import、module deep import、反向层依赖、浏览器引入 server-only package、全局 server-state store。
- Nx `affected` 在 PR 执行受影响项目的 lint/typecheck/unit/build；主线/发布仍执行全量 contract、e2e 和文档门禁。

## 10. 完成条件

1. `apps/web` 与 `apps/admin` 不再出现目标外 `features`、`ui`、`shared`、`network`、全局 `stores` 或 `sync-engine`。
2. 所有页面只通过 module `index.ts` 与生成 client 的公开接口消费业务能力。
3. `@sylis/components` 不包含业务规则，`@sylis/utils` 不包含框架、I/O 或领域逻辑。
4. TanStack Query 是唯一 server-state cache，Zustand 使用点都有明确临时状态理由。
5. Nx、ESLint 与 architecture tests 能自动阻止本文列出的禁止依赖。
