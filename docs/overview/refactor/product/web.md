# Web 重构

## 1. 产品壳与一次性改版

User Web 是 online-first responsive React 应用，在 `0.0.1` 一次性切换到新 API 和信息架构，不保留旧 route、DTO、local cache adapter 或双 UI。它保留四个一级入口：`背单词`、`AI`、`探索`、`我的`；词典搜索是全局能力，可从四个入口和阅读选词进入。

浏览器不得离线提交或排队同步答案、ReviewEvent、聊天、consent 或收藏。网络中断时保留尚未提交的本页输入并明确提示；恢复后由用户重试同一个 idempotency key。只有服务端确认成功的 attempt/review 才更新界面事实。

## 2. 路由树

```text
/(auth)/login
/(auth)/register
/(auth)/verify
/(app)/study/today
/(app)/study/books
/(app)/study/books/:bookId/editions/:editionId
/(app)/study/objectives/:objectiveId
/(app)/study/assessments/:blueprintKey
/(app)/study/assessments/sessions/:sessionId
/(app)/study/assessments/sessions/:sessionId/result
/(app)/ai/tutor
/(app)/ai/tutor/:sessionId
/(app)/ai/grammar
/(app)/explore
/(app)/explore/reddit
/(app)/explore/reddit/r/:name
/(app)/explore/reddit/posts/:externalId
/(app)/explore/ai-reading
/(app)/explore/ai-reading/:documentId
/(app)/reading/history
/(app)/reading/saved
/(app)/me
/(app)/me/consents
/(app)/me/sessions
/(app)/me/data
/lexicon/search
/lexicon/headwords/:id
/lexicon/entries/:id
/notebooks/:notebookId
```

旧 `/word-detail`、单一 `word.meanings[]` 页面和 vocabulary test 的客户端答案模型替换。

当前每条 route、页面和组件组的去向见 [前端目录与模块边界](../implementation/frontend-structure.md) 与 [当前代码到目标代码的重构映射](../implementation/workspace-refactor.md)。

`背单词` 默认进入 `/study/today`，`AI` 默认进入 `/ai/tutor`，`探索` 默认进入 `/explore`，`我的` 默认进入 `/me`。移动端使用四项 bottom navigation；桌面端使用同一四项 primary navigation，不为 viewport 维护第二套路由语义。

Admin 是独立 `@sylis/admin` 应用、域名、bundle、router 和 session，详见 [独立 Admin 应用](./admin.md)，不在本路由树增加隐藏 `/admin` 页面。

## 3. 前端架构

```text
src/
  app/            router、providers、layout、error boundary、session bootstrap
  pages/          React Router lazy page；页面布局、页面私有 component/hook
  modules/
    <name>/
      model/       浏览器领域 view model、form schema、query key
      api/         query/mutation options、DTO mapping
      store/       可选；真正跨页面的临时浏览器状态
      components/  可跨页面复用且属于该业务的组件
      index.ts     唯一 public surface
  assets/
  main.tsx
```

- `modules` 拥有业务逻辑、API/query 定义、可选临时状态和可复用业务组件；`pages` 只做 route page、布局和页面私有实现。
- module 之间只能导入对方 `index.ts`；`pages` 可以组合多个 module；module 不得反向导入 page/app。
- `@sylis/components` 提供 tokens、icons、styles 和无领域 React primitives；`@sylis/utils` 只提供跨 runtime 纯函数。应用不再建立 `shared/ui/lib` 聚合目录。
- TanStack Query 是唯一 server-state cache；禁止把 API response 复制进 Zustand、Context 或 route loader store。
- Zustand 只用于确实跨多个 route 保留的瞬时 UI 状态，例如未提交的 composer draft；登录身份、Job、词典详情、学习进度和 server pagination 不进入 Zustand。
- query key 至少包含 `userId`、`lexiconReleaseId`、资源 revision/ID 和 normalized filter；退出或 session identity 变化时先取消在途请求，再删除旧 user scope 的 query/mutation cache，最后导航。
- mutation 通过统一 transport 加 CSRF 与 idempotency key；feature 不直接 `fetch`。
- session cookie 对 JavaScript 不可见；bootstrap 只请求 `/api/v1/auth/session`，从响应取得 actor 和内存中的 session-bound CSRF token。
- OpenAPI client 只生成 transport/schema，领域 view adapter 负责缺失状态和显示组合，不能复造服务端规则。
- User client 由 `openapi-typescript + openapi-fetch` 生成/装配；route 和 feature 不手写重复 DTO。
- 所有页面使用 React Router lazy page；首屏只加载 shell、session 和当前 route，Admin/assessment/editor 等代码不进入无关 bundle。
- `app/router` 只依赖 page entry；page 只依赖 module public API、`@sylis/components` 和 `@sylis/utils`。

完整目录、User/Admin module 清单、依赖矩阵、公开 exports、当前路径迁移和测试门禁以 [前端目录与模块边界](../implementation/frontend-structure.md) 为准。

## 4. 身份与独立用户流程

注册、登录和恢复流程不得暴露邮箱是否存在。登录后直接进入当前 User，不显示 profile 选择器，也不允许创建或切换代管身份。用户本人可以查看或变更 consent、撤销设备、请求导出或删除；受限 capability 由服务端拒绝，Web 不通过隐藏按钮冒充授权。

设备页显示 session 名称、最近活动和撤销操作，不显示 cookie/token。查看导出下载、私人原文或变更敏感 consent 前触发 re-auth；完成后保持原导航上下文。

## 5. 词典详情

Headword 页面先展示同形词/POS Entry tabs；每个 Entry 内：

1. canonical/other/inflected forms 与发音；
2. 递归 Sense；
3. 每个 Sense 自己的定义、中文翻译、usage、examples、collocations；
4. Sense relation 与 Concept relation 分区；
5. frame/grammar pattern；
6. morphology、word formation、etymology；
7. 按需加载的 PedagogicalMaterial：通俗讲解、构词讲解、文化背景、助记、微故事；
8. source attribution 和 completeness。

不能把所有名词/动词释义混成一列，也不能把 Word family、inflection、synonym 和 collocation 放进同一个“相关词”数组。

Headword/Entry 首响应只携带 material kind/count/completeness；正文用 `["public-lexicon", releaseId, targetKind, targetId, "materials", kind, cursor]` 独立 query 懒加载。原文/译文 block 按自身 `languageTag` 渲染，MICRO_STORY 根据 lexical mentions 高亮目标形式；CULTURAL_CONTEXT 显示允许公开的引用，GENERATED mnemonic/story 明确标识为学习材料而非词源事实。

## 6. 缺失状态

| 状态             | UI                                         |
| ---------------- | ------------------------------------------ |
| `PRESENT`        | 正常展示                                   |
| `MISSING`        | 该项适用但当前缺可靠数据；低调占位，可反馈 |
| `NOT_APPLICABLE` | 完全不渲染该 section                       |
| `REJECTED`       | 普通用户不展示候选；内部 QA 可查看原因     |

“暂无数据”不能作为四种状态的共同结果。

## 7. Query state

- 使用 TanStack Query 的 query options factory，不在组件、route loader 或 Zustand action 内自行 fetch。
- public lexicon query key 至少为 `[scope, lexiconReleaseId, resourceKind, resourceId, revision, filters]`；user-owned key 额外包含真实 session `userId`，不能只用常量 `me`。
- active release 切换时保留旧 release cache 仅供当前已固定 revision 的页面完成渲染；新导航使用新 release key，不能覆盖同 key 下的数据。
- search cursor 与 query text/profile 绑定；切换过滤器重建 cursor。
- 页面组件只消费 API discriminated union，不从显示字符串推断 POS、target 类型或 correctness。
- mutation success 只按 server response 更新或 invalidate 精确 key；不得乐观伪造 Attempt correctness、Job terminal state 或 active release。

## 8. 学习交互

- 今日页展示 Objective 数量/状态，不展示“单词 = 一个学习状态”的旧模型。
- `exercise-player` 根据 `responseKind` 选择 choice/short-text/extended-text/no-capture renderer，再用 cardinality、placement、gradingMode 配置；`exerciseTaskKind` 只用于学习语义、筛选和分析，不决定 UI 组件。NO_CAPTURE renderer 只提供执行提示、揭示可靠发音/IPA 和 self-report，不申请麦克风权限。
- 进入一道题时显式 `POST /study/attempts`，使用返回的 attempt ID、ExerciseRevision 和固定 choice order；GET 页面不产生 exposure 写入。
- hint 渐进展开并上报 `hintUsed`；不能展示说明性大段教程文字占据主界面。
- 选择题选项使用 attempt 返回顺序，提交 attempt ID + choice ID；不在 bundle 中携带正确答案。
- SHORT_TEXT 在本地只做输入与 normalization preview；最终 correctness 由服务端决定。EXTENDED_TEXT 使用稳定尺寸编辑区、字数/字符限制和 rubric，`SELF_REPORT/AI_ASSISTED` 明确只用于练习。
- response 完成并终结 Attempt 后渲染纠正反馈和目标 Sense 上下文，再提交 FSRS rating；服务端原子创建 ReviewEvent 与 memory snapshots。

## 9. Assessment UI

- start response 只返回 session 和题目，不返回 correct response。
- 题目有稳定高度/布局，选项异步状态不引起跳动。
- timeout 由客户端显示、服务端根据 session policy 验证；客户端时钟不是唯一真相。
- result 页按 section、knowledge facet、接受/产出方向和 evidence kind 展示，不用任意 star 计算“词汇量”。
- 历史只显示新 AssessmentSession；当前无用户，无需旧记录兼容。

## 10. Reading、Reddit 与 AI

- Reading Core 详情组件只消费 ReadingDocumentRevision、annotation 和 activity contract；Reddit feed/comment tree 仍使用来源特有组件。
- 用户选词先 resolve，再显示 Entry/Sense 候选；收藏保存明确 target，不把屏幕字符串直接建成 Headword。
- AI Reading 创建后立即进入 Job 页面/行内状态，展示 stage、processed/total、可解释 warning 和真实 terminal result。
- Tutor 以 SSE 渲染同一条 assistant message；刷新或断线用 event ID 恢复，不新增一条消息。
- Grammar 结果按 observation/evidence/suggestion 展示；不把 AI 输出包装成权威分数。
- 无权访问、来源撤回、Job 失败、无 annotation、无学习目标和内容为空分别设计状态，不能共用“暂无数据”。

## 11. Module 组件目标

```text
modules/lexicon/components/
  headword-entry-tabs  form-list  sense-tree  relation-groups
  examples  collocations  frames  morphology  pedagogical-materials
modules/study/components/
  objective-summary  hint-list
modules/exercises/components/
  exercise-player  responses/choice  responses/short-text
  responses/extended-text  grading/self-report
modules/assessments/components/
  session-progress  section-navigation  result-breakdown
modules/reading/components/
  reading-document  lexical-annotation  reading-progress  collect-target
modules/ai-tutor/components/
  tutor-thread  stream-status  grammar-observation  generation-progress
modules/identity/components/
  user-profile  consent-control  session-list
```

旧 `word-quiz-choice`、`word-quiz-recall`、`word-recognition`、`word-spelling` 中可复用的视觉组件迁移到 response renderer；其 Word-specific data contract 删除。

## 12. 语音范围

首期删除浏览器录音、语音上传、ASR、发音评分和相关权限/UI。删除直接拼接有道 `dictvoice` URL、把 `speechSynthesis` 当作权威发音以及未使用的 WAV 转换遗留；只播放 API 从 release 返回且携带 provenance/rights/region/hash 的音频。无可靠音频时不显示控制。未来发音评测必须另做 consent、短期 retention 和评测误差设计。

## 13. Accessibility 与国际化

- response renderer 使用原生 button/radio/input/textarea 语义、键盘焦点和 screen-reader label。
- correct/incorrect 不只用颜色；反馈使用 text + icon + aria-live。
- language-specific 内容设置 `lang`；IPA 与普通文本区分。
- choice shuffle 不改变 DOM focus 目标；提交后锁定当前顺序。
- 支持 prefers-reduced-motion；学习高频流程避免装饰性动画。

## 14. Frontend 验收

desktop/mobile 覆盖注册/登录、本人 consent、长 headword、长中文翻译、深层 Sense、五类 PedagogicalMaterial、无数据/部分数据、单选/多选/短文本/inline cloze/extended text/no-capture 朗读自评、网络重试、release 切换、过期 session、SSE 重连、来源撤回和 Job 失败。Playwright 截图与交互测试必须证明文字无重叠、按钮可触达、选项不会泄露答案、NO_CAPTURE 不请求麦克风权限、长故事按需加载、退出后旧 User 数据不会闪现在新 session。
