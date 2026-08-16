# 词典与学习架构

原单篇研究文档已经整理为模块化、可实施的绿地重构文档，后续决策只维护新目录，避免关系表、JSON、题库和交付流程出现两套事实源。

[进入 Sylis 绿地重构总览](/refactor/)

新文档包含：

- 五套词典规范与 Sylis 的关系模型；
- 完整关系表和单一 `sylis-lexicon-v1.json` 契约；
- ECDICT、Kaikki/Wiktextract、OEWN、有道与 DeepSeek 合并流程；
- 独立 lexicon compiler、streaming importer 和 release 激活；
- LearningObjective、共享 Stimulus、可复用 Exercise、组卷和 FSRS；
- API/Web 绿地替换、迁移、测试、Railway CI/CD 与密钥管理。
