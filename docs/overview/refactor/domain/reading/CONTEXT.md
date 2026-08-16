# Reading

本上下文统一阅读材料的稳定生命周期，同时允许 Reddit、AI 阅读和未来来源拥有独立产品体验。

## Language

**ReadingDocument**:
可被阅读、收藏和用于学习的稳定内容身份。
_Avoid_: Article, post

**ReadingDocumentRevision**:
一次不可变的标题、正文、语言和来源内容版本。
_Avoid_: current content, snapshot blob

**DocumentOrigin**:
说明文档来自 AI、Reddit、用户或其他 adapter 的来源身份。
_Avoid_: article type

**ContentExperience**:
围绕某类来源建立的独立浏览和交互产品，例如 Reddit 或 AI 阅读。
_Avoid_: content tab, unified feed

**ReadingActivity**:
User 对某个文档 revision 的打开、进度、完成或查词事实。
_Avoid_: history row, stats

**ReadingProgress**:
由同一 User/Document 的 append-only ReadingActivity 精确重建的当前阅读投影。
_Avoid_: mutable progress truth, independent counter

**ReadingCollection**:
User 拥有的稳定阅读收藏容器；`library` 是系统 identity key，不是 UI 名称。
_Avoid_: global folder, saved flag

**LexicalAnnotation**:
把文档中的稳定文本锚点关联到明确 Lexicon target 的标注。
_Avoid_: highlighted word, token config

**ReadingTarget**:
从阅读材料和学习状态中选出的、希望在当前阅读中接触的 LearningObjective。
_Avoid_: weak word

**ReadingPublicationProposal**:
把 User 拥有的 exact ARTICLE Artifact revision 发布为私人 ReadingDocument 的一次 typed Proposal；批准、Grant、fencing lease 与幂等记录都绑定同一 action digest。
_Avoid_: publish button state, direct artifact copy
