# Agent 会话 Block 与流式投影

> 状态：`0.0.1` 目标架构。本文定义 Learning Agent 聊天中的 Notion-inspired Block、流式生命周期、持久化所有权和前端投影；它不定义 Provider 原始响应，也不把聊天展示结构提升为正式学习或词典事实。

## 1. 目标与取舍

Notion 把页面内容建模为带稳定 ID、明确类型、父子关系和顺序的 Block，并把 rich text 放在支持文本的具体 Block 中。[Notion Block reference](https://developers.notion.com/reference/block)、[Working with page content](https://developers.notion.com/guides/data-apis/working-with-page-content)

Sylis 采用其中对聊天有价值的部分：

- 一段解释、代码、工具状态、Artifact、Proposal 或等待状态都有稳定 Block identity；
- Block 使用闭合 typed union，不靠 Markdown heading、任意 `type + JSON` 或 UI 组件名猜语义；
- 支持有界父子结构、稳定同级顺序、逐块流式完成和局部状态更新；
- 文本内的 lexical mention、citation 和 link 使用 typed rich-text span，不把它们拆成无上下文卡片；
- Session snapshot 与同一条 SSE 可以完整恢复 Block 树，不轮询 Message、ToolCall 或 Artifact。

Sylis 不复制 Notion 的协同编辑器、任意页面数据库、拖拽重排、评论、模板或开放插件 Block。聊天历史是可审计输出，不允许原地编辑或重排；需要继续编辑的文章、语法分析、翻译和练习使用 immutable `AgentArtifactRevision`。

## 2. 三种 Block 不得混用

| 名称                    | Owner          | 用途                                                        | 是否进入浏览器                     |
| ----------------------- | -------------- | ----------------------------------------------------------- | ---------------------------------- |
| `ModelContentBlock`     | Model Gateway  | Provider-neutral 的 text/tool-call/usage/terminal 模型交换  | 否；只经 Runtime 消费              |
| `AgentMessageBlock`     | Agent API      | User 可见消息中的稳定 typed Block、顺序、生命周期和领域引用 | 是；通过 Session snapshot/SSE 投影 |
| `AgentArtifactDocument` | Learning Agent | 可版本化文章、分析、词汇解释或练习集的完整结构化内容        | 只按 Artifact revision 查询        |

`BlockAssembler` 是 `@sylis/agent-runtime` 内部实现，不是第四种持久模型。它把有序 `ModelContentBlock` 转成 `AgentMessageBlockProposal` 和完整 `AgentStepProposal`；它不能写数据库、解释前端组件或让 Provider tool name 直接成为领域写入。

词典 Artifact 中的 `PedagogicalMaterialBlock`、测评 `StimulusBlock` 也不是 Agent Message Block。它们属于不同 bounded context、schema namespace 和 release 生命周期，禁止为了复用 renderer 而共享数据库表。

## 3. 消息与 Block 树

`AgentMessage` 是一次可见发言的 envelope，`AgentMessageBlock` 是其内容和交互单元：

```text
AgentSession
  -> AgentMessage(sequence, role, derived status)
       -> AgentMessageBlock(parentBlockId?, position, modelPosition?, modelSubPosition?, kind, status)
            -> exactly one typed payload or typed reference
```

约束固定为：

1. Block 必须属于一个 Message；根 Block 的 `parentBlockId` 为空，子 Block 的 parent 必须属于同一 Message。
2. 同一 parent 下 `position` 非负且唯一；streaming 期间允许为尚未通过 preflight 的中间 model position 保留空位，Message terminal 时每组 sibling 必须从零开始连续。模型输出额外保存 `stepId + modelPosition + modelSubPosition`；一个 Provider text block 被拆成多个展示 Block 时，`modelSubPosition` 从零连续递增，展示顺序不能由完成时间改变。
3. 最大深度为 6，每个 Message 最多 256 个 Block；超过限制时 Runtime 必须生成受控 Artifact 或明确失败，不能静默截断。
4. 只有 `LIST_ITEM | QUOTE | CALLOUT` 可拥有 children；`TOOL_CALL | ARTIFACT | PROPOSAL | PLAN | WAIT_CONDITION | ASSET | NOTICE` 永远是叶节点。
5. 已 `SEALED` 或 `INTERRUPTED` 的 Block 不可修改 payload、parent、position、kind 或引用；删除 Session 走统一隐藏与 purge，不逐块物理编辑历史。
6. User 修改上一条内容会创建新的 Instruction/Message，并用 `supersedesMessageId` 表达意图；不会改写旧 Block。

### 3.1 闭合 Block kind

| 类别       | `AgentMessageBlockKind`                                                         | typed payload/reference                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 文档内容   | `PARAGRAPH, HEADING, LIST_ITEM, QUOTE, CALLOUT, CODE, EQUATION, TABLE, DIVIDER` | rich-text body、heading level、list style、code language、KaTeX expression 或有界 table rows/cells                                          |
| Agent 引用 | `TOOL_CALL, ARTIFACT, PROPOSAL, PLAN, WAIT_CONDITION, ASSET, NOTICE`            | 分别强引用 AgentToolCall、AgentArtifactRevision、AgentProposal、AgentPlanRevision、AgentWaitCondition、ContentAssetRevision 或 typed notice |

每行 `AgentMessageBlock` 必须恰好存在一种匹配 `kind` 的 typed child。不得使用 `referenceType/referenceId` polymorphic pair、任意 JSON payload、React component name 或 Provider block type。

`HEADING` 只允许 1-3 级；`CODE` 只展示和复制，绝不执行；`EQUATION` 使用受限 KaTeX；`TABLE` 有行列与单元格长度上限。`NOTICE` 只允许版本化 `INFO | WARNING | ERROR | RECOVERY`，并保存稳定 code，不把异常堆栈传给 User。

### 3.2 Rich text

文本类 Block 的正文由 Model Gateway 以加密 `ModelContentBody` 保存，解密后的 schema 是有界 rich-text span 数组：

```typescript
type AgentRichTextSpan =
  | { kind: "TEXT"; text: string; marks: readonly AgentTextMark[] }
  | { kind: "LEXICAL_MENTION"; text: string; target: LexicalTargetRef }
  | { kind: "CITATION"; text: string; evidenceRef: AgentEvidenceRef }
  | { kind: "LINK"; text: string; href: string };
```

`AgentTextMark` 只允许 `BOLD | ITALIC | UNDERLINE | STRIKETHROUGH | INLINE_CODE`。不保存或渲染 raw HTML、style、script、事件属性、任意颜色、data URL 或 Provider citation object。Link 只允许经过服务端 canonicalization 和 SSRF/scheme policy 的 `https` URL；词汇目标和来源证据使用 typed reference，不能依赖文本 offset 之外的猜测。

普通聊天 text block 使用固定版本的 CommonMark-compatible parser 转换为 closed Block tree，raw HTML 和任意 extension 默认关闭。Assembler 只在结构边界闭合后提交 heading/list/code/table 等 Block，未闭合行保存在有大小上限的内存 buffer；不能用正则或前端 Markdown renderer 各自猜结构。为保证已经持久化的 Block kind 不被后续输入回溯改变，标题只接受 ATX `#` 语法，禁用会把上一段回溯改成标题的 Setext `===/---` 语法；`---` 继续作为独立 divider。结构化 Capability 仍直接生成并验证 Artifact schema，不先生成 Markdown 再反向解析领域事实。

## 4. 流式生命周期

`AgentMessageStatus` 是由 append-only message lifecycle events 和 Block 状态计算的 `STREAMING | COMPLETED | INTERRUPTED` projection，不原地修改 AgentMessage envelope；`AgentMessageBlockStatus` 固定为 `STREAMING | SEALED | INTERRUPTED`。流式操作是 append-only，不是通用 JSON Patch：

```text
MESSAGE_STARTED
  -> BLOCK_OPENED
  -> BLOCK_DELTA_APPENDED ...
  -> BLOCK_SEALED | BLOCK_INTERRUPTED
  -> MESSAGE_COMPLETED | MESSAGE_INTERRUPTED
```

`BLOCK_DELTA_APPENDED` 只允许向当前文本类 Block 追加下一个有序 fragment；不能更改 kind、parent、position、mark 或引用。Model Gateway 在 fragment 可见前先以 `(invocationId, modelPosition, modelSubPosition, fragmentSequence)` 幂等保存加密 fragment 或 sealed body；其中 `modelSubPosition` 是 Runtime parser 在同一 Provider block 内分配的稳定展示分区，不是 Provider index。Agent Event 只保存 opaque body/fragment ref 和安全元数据。Provider token 先按版本化大小/时间策略合并成 fragment，禁止每个 token 形成一条数据库行。

Agent API 先提交关系行与 `AgentEvent`，再通过 outbox/Redis 唤醒 SSE。Redis 只传 wakeup，不是 fragment 或 Block 真相。新连接的 `SESSION_SNAPSHOT` 包含当前 Message/Block 树、持久 cursor 和每个 Block 的当前可见正文；带 `Last-Event-ID` 的重连只补发 cursor 之后的事件。浏览器刷新、Redis 丢通知或 SSE 重连都不能创建新 Message、Step、ToolCall 或 ModelInvocation。

Provider 流在 Block 中途失败时，已可见内容保留，当前 Block 和 Message 进入 `INTERRUPTED`，并追加可重试的 typed `NOTICE`；禁止把未闭合文本伪装成完成回答。任一 normalized output block、fragment、tool call 或 usage 已被接受后，v1 不自动创建下一个 transport attempt；User 主动 retry 创建新的 Run/Message，旧 interrupted Block 保留审计。

## 5. Runtime 接入

`BlockAssembler` 位于 `@sylis/agent-runtime` 内部，并遵守以下顺序：

1. 消费 `AgentModelPort.stream()` 的 ordered `ModelContentBlock`；hidden reasoning 永不进入 assembler。
2. 为可见文本分配稳定 `messageId/blockId/modelPosition/modelSubPosition`，使用固定版本 parser 按闭合语义边界打开文本类 Block，并通过 `AgentStepPort.appendVisibleDelta()` 提交受控 fragment。
3. 收集全部 tool-call block 和 control action；ToolCall 即使出现在文本之间也保留原 `modelPosition`，不因延后执行而移到末尾。
4. 等唯一 terminal frame 后关闭文本 Block，组装完整 `AgentStepProposal`；Agent API 在副作用前原子 preflight Step 并创建 ToolCall 与引用 Block。
5. Runtime 仅执行 `AgentStepExecutionPlan` 中获准 directive；ToolCall 状态事件更新同一个引用 Block，不追加 queued/running/succeeded 三张重复卡片。
6. 所有 receipt 按 `modelPosition` 提交后才允许创建下一次 ModelInvocation；下一 Step 的回答创建新的 Agent Message，而不是修改前一 Message。

若内部 Model Gateway NDJSON 在已经接收完整 normalized text block 后断开，Runtime 必须把已组装正文通过独立、短时 finalization signal 保存为未封口 fragment；Agent API 随 Runtime settlement 将对应 Block 和 Message 标记为 `INTERRUPTED`。取消信号不能自动抹掉 Provider 已经接受并返回的正文。

`appendVisibleDelta()` 的 interface 必须携带稳定 Message/Block identity、model position/sub-position、tree position、fragment sequence 和 opaque content ref。它不能只传裸字符串，也不能允许调用者提交任意 Block JSON。

## 6. Artifact、工具和领域真相

- 短解释可以由文本类 Block 直接表达；可复用或可继续编辑的文章、语法分析、翻译分析、词汇解释和练习集必须先成为 `AgentArtifactRevision`，聊天中只放 `ARTIFACT` reference Block。
- Artifact Block 固定 exact revision；Artifact 后续编辑产生新 revision，不让历史 Message 悄悄显示最新版。
- ToolCall Block 只投影 AgentToolCall 当前状态和安全摘要；完整输入、secret、raw Provider body、内部错误和 hidden reasoning 不进入 Block。
- Proposal Block 固定 action digest、目标、影响、expiry 和 approval 状态；参数变化创建新 Proposal/Block，旧批准不能复用。
- Plan、WaitCondition、Asset 都使用 exact typed reference；Block 不是这些对象的第二份状态机。
- 正式 Lexicon、Exercise、ReviewEvent、FSRS 和 Reading truth 只能由所属 owner 的 typed command 创建，不能从 Block 反向解析写库。

## 7. 前端投影

Web Agent module 维护一个 Session event reducer，以 `blockId` 为 key，以 `AgentEvent.sequence` 去重，并按 `message.sequence -> parent path -> position` 渲染。Renderer registry 是前端 module 内部实现，每个 closed block kind 恰好一个 renderer；未知 kind/schema version 显示安全的“不支持此内容版本”占位并保留导出能力，不能退化为 `dangerouslySetInnerHTML`。聊天中的 heading 使用紧凑内容层级，不渲染成页面 hero 尺寸。

Rich text renderer 必须保留 `CITATION.evidence` 与 `LEXICAL_MENTION.target` 的 typed identity，不能只留下显示字符串；外部链接只接受后端已归一的 HTTPS href，并以新窗口安全属性渲染。Table 暴露行列规模的可访问名称，Code 保留原文与 language metadata。`INTERRUPTED` Block 同时保留已提交 partial body 与 status 语义；screen reader 只播报中断/完成等状态，不逐 token 朗读。

交互规则：

- streaming 文本只更新当前 Block，不让整条消息或后续卡片重新挂载；
- ToolCall/Proposal/Wait 状态原地更新同一 stable Block，键盘焦点和展开状态不丢失；
- Artifact 在 inspector 懒加载 exact revision，timeline 首帧只带标题、kind、状态与安全 preview；
- 桌面和移动端使用同一 projection；移动端 inspector 可以换成底部层或独立路由，但不能创建另一份聊天状态；
- `aria-live` 只播报 Block/Run 状态摘要，不逐 fragment 朗读；代码、表格、引用和操作均可键盘访问。

前端没有 `PATCH /blocks`、tool execute、Run polling 或 Provider stream endpoint。Composer 仍只提交一次 Instruction POST；一个 Session 只维护一条 SSE。

## 8. 安全、容量与可观测性

- 所有 Block DTO 先按 discriminated union、schema version、大小、深度、URL 和 typed reference 校验；invalid output 在 preflight 前失败。
- Snapshot 和 Event 只包含 User 已授权 Session 的 Block；Admin 只看 redacted kind/status/size/ref metadata。
- 日志记录 session/run/step/message/block identity、kind、fragment count/bytes、首块/首字延迟、sealed/interrupted 状态，不记录正文或 secret。
- 单 Block、Message、Run、table、code 和 citation 数量均有 CapabilityRelease 固定上限；超限不能靠前端截断掩盖。
- 删除 Session 后 Block 与 content body 立即从产品 projection 隐藏，并进入同一 30 天 hard-purge 流程。

## 9. 必测场景

1. 一次模型响应产生段落、ToolCall、段落、两个 ToolCall 和 Artifact；UI 按模型顺序显示稳定 Block，工具可乱序完成但卡片不换位。
2. 同一个 ToolCall 从 queued 到 failed 只存在一个 Block；其他 sibling 成功并继续进入下一 Step。
3. SSE 在文本 Block 中途断开；重连 snapshot + cursor 后正文无重复、无缺口，且没有新 Run/Invocation。
4. Executor 在工具完成后重启；恢复只投影已有 receipt，不重放 ToolCall。
5. Provider 在没有 accepted normalized block、visible fragment、tool call 或 usage 前发生 retryable transport failure 时只增加 `ModelInvocationAttempt`，原 Message/Block/Step identity 不变；任何一项已被接受后不自动 retry。
6. Provider 在 Block 中途失败；已显示正文标记 `INTERRUPTED`，不会显示完成态或丢失。
7. 恶意 HTML、`javascript:` URL、越权 typed ref、过深树、cycle、重复 position、错误 child kind 和超大 table 全部 fail closed。
8. Artifact 更新产生新 revision；旧聊天 Block 仍打开原 revision。
9. User 请求本地文件、shell 或任意 MCP Block 时，v1 返回受控拒绝，不在浏览器执行。
10. desktop/mobile/keyboard/screen-reader 覆盖长文本、代码、table、citation、ToolCall、Proposal、Wait、unknown schema 和 interrupted 状态。

## 10. 非目标

v1 不实现聊天 Block 的协同编辑、CRDT、拖拽重排、任意嵌入、第三方 Block plugin、Block 级评论、公开分享页面或从 Block 自动发布正式内容。未来若需要真正的文档编辑器，应以新的 Artifact editing interface 和 revision model 实现，而不是放宽 Agent Message 的 append-only 不变量。
