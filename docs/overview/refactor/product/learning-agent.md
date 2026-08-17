# Learning Agent 产品契约

## 1. 产品定位

Learning Agent 是贯穿 Sylis 的通用学习代理，不是单独的聊天玩具。User 可以从 Agent workspace 开始，也可以从词典、阅读、练习、Notebook 或学习计划带上下文进入同一个 AgentSession。Tutor、语法、翻译、阅读生成和练习生成都由 Capability 表达，不再拥有孤立页面和互不相通的聊天记录。

v1 是服务端 Agent：User 关闭页面或更换设备后，已接受的 Run 仍由 Railway 上的 Agent Executor 按持久状态继续或等待；浏览器不运行 Agent loop、模型或工具。AI 模型可以由远程 Provider 提供，但 Provider 只负责推理，不能访问 Sylis 数据库或直接写入学习状态。本地 Agent、本地文件 Connector、shell 和任意 MCP 不进入 v1。

权威运行、工具、权限、记忆和安全架构见 [Learning Agent 系统架构](../architecture/learning-agent-system.md)，消息 Block 契约见 [Agent 会话 Block 与流式投影](../architecture/agent-conversation-blocks.md)。本文只定义 User 能感知的能力和产品行为。

## 2. v1 Capability

| Capability            | 典型请求                       | 主要结果                               |
| --------------------- | ------------------------------ | -------------------------------------- |
| `learning.chat`       | 解释、追问、比较或制定下一步   | AgentMessage，可附 Artifact/Proposal   |
| `lexicon.explain`     | 解释指定词、Sense、Form 或搭配 | 结构化词汇解释 Artifact                |
| `grammar.analyze`     | 分析 User 句子或段落           | observation/evidence/suggestion        |
| `translation.analyze` | 翻译并解释选择与歧义           | 对齐、候选、取舍与修订建议             |
| `reading.compose`     | 按主题、目标词和难度生成文章   | immutable Reading Artifact             |
| `practice.generate`   | 为目标词或薄弱点生成练习       | `PRACTICE_ONLY` Exercise candidate set |
| `study.coach`         | 根据显式学习事实安排学习       | 建议计划或可批准的私人写入 Proposal    |

默认模式为 `AUTO`，User 可显式选择 Capability。路由结果在时间线可见；系统不会把“AI 页面”本身当作能力。

## 3. 会话与并发

- 一个 AgentSession 可有多个可见的 QUEUED Root Run，但同时最多一个 RUNNING/WAITING Root Run。
- 每条已接受的 Instruction 立即得到自己的 `runId`；排队不是“暂时没有 Run”，也不会复用前一条 Instruction 的 Run。
- User 在 Run 进行中发送的新指令进入可见队列，不静默改写当前目标。
- User 可取消当前 Run 并让新指令抢占；已产生的 Event、ToolCall 和 Artifact revision 保留审计。
- ChildRun 默认关闭；CapabilityRelease 明确允许时，Root Run 最多使用三个并行 ChildRun，且 ChildRun 不再嵌套。
- 需要批准、补充信息、等待 ChildRun 或外部事件时，Run 显示明确 WAITING 状态和下一步。
- `WORKFLOW`/`AGENT_LOOP` 在执行前展示固定到 Run 的 immutable plan；`SINGLE_CALL` 才可省略 plan。

## 4. Agent workspace

正式路由：

```text
/agent
/agent/sessions/:id
```

现有移动学习入口 `/ai` 不再拥有旧聊天协议；它复用同一 Session、Run、SSE、Block renderer 和 model selection，只保留原移动 AppBar、会话侧栏、配置抽屉与视觉结构。

桌面布局：

```text
┌──────────────┬─────────────────────────────────────────────┐
│ Sessions     │ Events / Messages / Composer                │
│ search/list  │ queue, tool and wait states                 │
└──────────────┴─────────────────────────────────────────────┘
                     └─ Artifact / Approval modal inspector ─┘
```

Inspector 覆盖在聊天上方，不能把桌面布局推成三栏。移动端使用全屏 workspace，inspector 通过全屏覆盖层或独立路由打开。全局 Agent 入口在当前页面打开上下文侧栏；提交前展示将被共享的 Objective、Sense、ReadingRevision 或 Attempt 摘要，User 可移除。

删除旧的独立 Tutor、Grammar 和 AI Reading 页面。旧入口改为携带明确 context ref 打开 Agent，不保留第二套 Session 或生成逻辑。

## 5. 流式与进度

Agent 时间线统一显示：消息 delta、工具排队/开始/完成、Proposal、批准、Artifact revision、WaitCondition、warning、完成和失败。同一步可以先显示 Agent 文本，再按模型顺序显示多个独立 ToolCall；每个调用使用稳定 `stepId + callId` 更新 queued/running/succeeded/failed/rejected/cancelled 状态，一个失败或预算拒绝不会把其他卡片伪装成失败。新连接先收到 Session snapshot，之后只消费 typed events；每个事件有稳定 sequence，浏览器断线后用 `Last-Event-ID` 恢复，不重新创建 ModelInvocation 或重复计费。同一 tab/Session 共享一个 SSE，聊天和结构化生成不再轮询消息、Run、Artifact 或 Proposal，也不直接调用 Model Gateway、Executor、Agent Runtime 或 tool execute endpoint。

时间线使用 Notion-inspired Block，但不是自由编辑器。段落、标题、列表、引用、提示、代码、公式、表格和分隔线是受控文档 Block；ToolCall、Artifact、Proposal、Plan、WaitCondition、Asset 和 Notice 是 typed reference Block。每个 Block 有稳定 identity、父子位置和 streaming/sealed/interrupted 状态；同一个工具的 queued/running/terminal 只更新同一张 Block，不重复插入卡片。User 不能拖拽或原地改写历史回答；需要继续编辑的长内容在 inspector 中创建新的 Artifact revision，历史 Block 始终固定原 revision。

文本内的词汇目标、来源引用和链接使用可点击的 typed span。raw HTML、任意 embed、可执行代码和未知 schema 不直接渲染；不支持的 Block 显示安全占位并允许导出。移动端与桌面端消费同一 Block projection，不建立第二套聊天状态。

长生成展示 stage、processed/total、ETA reliability、token/cost 和最后 heartbeat。total 或 ETA 不可靠时必须显示“估算中”而不是虚假百分比。

## 6. Artifact 与正式内容

文章、语法分析、翻译分析、词汇解释和练习集以 `AgentArtifact` 的 immutable revision 保存。Artifact 可以被 User 删除、收藏或继续修改，但不会自动成为正式 Lexicon/Exercise/Reading truth。

- 私人练习由 runtime-neutral 的 `agent-contracts` 拥有 candidate schema，题型、response 和评分矩阵与正式 Exercise 语义一致，资格最多为 `PRACTICE_ONLY`；进入正式题库时必须显式转换、校验和审核。
- 缺词先产生私人解释 Artifact 和去重 `LexiconGapReport`。
- 进入全局词典或题库需要 User 公共同意、Admin review、versioned candidate dataset、compiler validation 和下一次完整 release。
- Agent feedback 不能直接提交 summative score 或 FSRS ReviewEvent；只有正式 ExerciseAttempt 流程可更新学习状态。
- Agent Artifact 只有在 User 明确“接受为文件”后才创建新的 immutable ContentAssetRevision；后续编辑继续创建 revision。

## 7. 工具与批准体验

公共 Web 搜索和 Sylis 私人只读工具在当前 Grant 内运行，并在时间线显示来源。私人写入先显示 Proposal：动作、目标、影响、可撤销性、有效期和需要的批准。User 批准绑定 action digest；Agent 修改参数后必须重新批准。

v1 不出现 shell、任意 MCP、第三方写入或语音工具。支持 TXT、Markdown、PDF、DOCX、EPUB、PNG、JPEG、WebP；上传先显示 quarantine/scan/parse 状态，只有 READY 的精确 revision 才可加入 instruction context。独立 HTML、SVG、通用压缩包、宏和可执行文件直接拒绝；DOCX/EPUB 作为白名单 container 严格解析。

## 8. 模型与密钥

Run 创建时显示使用的平台额度或 User 明确选择的 BYOK，不允许执行中静默切换。支持 DeepSeek、OpenAI、Anthropic 和 Gemini；精确 ProviderRouteRelease 与 CredentialRevision 在 Run 创建时固定，不由客户端提交任意 model string，也不在失败后静默 failover。

BYOK 错误明确说明 provider、credential 状态和可采取动作；绝不自动使用平台额度。前端只能看到 masked credential metadata，不读取或回显明文 key。

## 9. 记忆、隐私与删除

Learning Agent 不建立不可见的完整 User 画像。长期 MemoryCard 在设置中可查看、更正、删除或 suppress；完整聊天不进入全局搜索索引。ContextSnapshot 只使用本次显式选取的内容和授权 projection。

基础聊天保留 User message 与最终回答。保存规范化完整模型 exchange 是可拒绝、可撤回的独立 consent；hidden reasoning、system prompt 和 Provider raw body 永不保存。撤回 optional exchange 后立即隐藏并在 30 天内 purge，且不影响基础 Agent 功能。

用户内容或文件删除后立即从产品查询隐藏，并在 30 天内 hard purge。Admin/support 对模型 exchange 始终只能看到 redacted metadata；需要排障时由 User 主动生成可预览、可编辑、自动脱敏的 diagnostic bundle。

## 10. 验收场景

1. 在词典详情打开 Agent，context 只包含 User 选定的 Entry/Sense，而不是整库对象。
2. Run 中追加第二条指令时立即返回第二个 Root Run 并显示 QUEUED；取消当前 Run 后调度该既有 Run，而不是届时才创建。
3. 生成练习只产生私人 `PRACTICE_ONLY` Artifact，不改变正式题库或 FSRS。
4. Proposal 等待批准时 Run 为 WAITING，后台没有占用中的 Job；批准后新 Job 恢复同一 Run。
5. SSE/Redis/API 重启不重复模型调用、工具副作用、Artifact revision 或费用结算。
6. BYOK 失效时返回明确错误，平台用量保持不变。
7. User 删除 Session 后立即不可见，并可从 purge 审计证明 30 天内完成清除。
8. 恶意/错误类型文件停留在 quarantine/REJECTED，无法被 Agent 或其他 User 引用；安全文件历史固定 revision。
9. 撤回 full-exchange consent 后中间 exchange 立即不可见，但 User message/final answer 与 Agent 基础功能不受影响。
10. 一次普通发送只新增一次 instruction POST，并复用一个 Session SSE；Network 面板不出现 messages/runs/artifacts/proposals 定时 GET。
11. 一次模型响应同时包含文本和三个 ToolCall 时，文本、三个独立状态与最终回答按同一时间线显示；刷新页面只回放事件，不再次执行工具。
12. 一个 ToolCall 失败且两个成功时，三个结果分别显示，Run 可把完整结果交回模型继续回答；取消时未启动与结果未知的调用状态可区分。
13. 一次输出包含标题、段落、列表、代码、ToolCall 和 Artifact 时，每个 Block 保持稳定顺序；工具状态变化不会让文本或焦点跳动。
14. SSE 在文本 Block 中途断开后，snapshot + cursor 恢复的正文无重复、无缺口，Message/Block/Run identity 不变。
15. AgentArtifact 产生新 revision 后，旧聊天 Block 仍打开它当时引用的 exact revision，不静默展示最新版。
16. 恶意 HTML、越权 reference、过深 Block tree、未知 schema 与可执行 embed 均 fail closed，桌面/移动端仍可读取其安全状态。
17. 模型提出的多个只读工具调用按 Run/Grant 剩余额度逐个判定；额度内调用继续执行，超额调用显示明确 rejected 状态，Agent 仍可基于已取得证据完成回答。
18. Agent API 或内部执行失败展示服务端稳定错误码对应的可操作信息；前端不会只得到笼统的 `AGENT_API_HTTP_409`。
