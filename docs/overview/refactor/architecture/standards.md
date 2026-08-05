# 标准与设计依据

Sylis 不把任何一套规范误当成可直接复制的 PostgreSQL schema。规范提供语义边界，关系表负责实现约束，标准 JSON 负责交换。

## 1. 五套词典模型的职责

| 规范                                                                                | 采用内容                                                             | 不直接照搬的部分                                                                |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [ISO 24613-1:2024 LMF Core](https://www.iso.org/standard/82014.html)                | LexicalEntry、Form、Sense 等核心元模型与多语词汇资源边界             | ISO 公开页不提供完整数据库字段；不声称未读取的付费正文细节                      |
| [ISO 24613-6:2024 LMF SynSem](https://www.iso.org/standard/83180.html)              | 句法行为、语义谓词、句法参数到语义参数映射                           | 不把搭配文本当成完整 SynSem frame                                               |
| [TEI P5 Dictionaries](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/DI.html) | 人类词典内容、同形词、递归 Sense、定义、用法、引用、词源和例句的层级 | 不保存 TEI 的排版自由度和 XML 呈现结构                                          |
| [OntoLex-Lemon](https://ontolex.github.io/ontolex/specification.html)               | Entry/Form/Sense/Concept 分离、decomp、vartrans、synsem 和可解析关系 | Sylis 不以 RDF triple store 作为主存储，也不把 ontology reference 当 definition |
| [WN-LMF](https://globalwordnet.github.io/schemas/)                                  | Synset/Concept、Sense membership 和 WordNet relation 的互换          | 不要求所有近义词共享 synset；近义但不等价用 relation                            |

五者不是竞争关系：LMF 给核心，SynSem 给句法语义接口，TEI 给人类词典层级，OntoLex 给图关系与分解，WN-LMF 给 synset 网络交换。数据库取它们的交集和 Sylis 产品需要的扩展。

## 2. 文本、语言和形态

| 依据                                                                                   | 设计决定                                                                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [RFC 5646 / BCP 47](https://www.rfc-editor.org/rfc/rfc5646)                            | 所有语言字段使用 canonical language tag；固定 IANA registry snapshot 做构建验证         |
| [Unicode UAX #15](https://www.unicode.org/reports/tr15/)                               | identity text 使用 NFC；NFKC 只用于搜索辅助，不能把兼容字符自动合并                     |
| [Unicode UAX #29](https://www.unicode.org/reports/tr29/)                               | example/morphology offset 不得切开 extended grapheme cluster                            |
| [Unicode TR35 / CLDR](https://unicode.org/reports/tr35/)                               | 排序键记录 CLDR、UCA、locale 和 ICU 版本，避免运行环境升级静默改序                      |
| [Universal Dependencies features](https://universaldependencies.org/u/feat/index.html) | `VerbForm`、`Tense`、`Number` 等作为受控形态 feature 映射依据，不直接保存来源标签字符串 |

## 3. 来源工具与词网

- [Wiktextract](https://github.com/tatuylonen/wiktextract) 是确定性 Wiktionary dump 解析器，不是小模型。它展开模板/Lua 并输出 senses、forms、form-of、发音、关系、翻译和词源等 JSONL。
- [Kaikki](https://kaikki.org/dictionary/rawdata.html) 提供定期更新的预解析 Wiktextract 制品。Sylis 固定下载版本和 checksum，不读取“最新”浮动文件直接发版。
- [Open English WordNet](https://en-word.net/) 提供英文 synset 和语义关系证据；其 ID 不替代 Sylis stable Concept ID，而是 external identifier。
- ECDICT 贡献基础中英文本、`exchange`、频率和考试标签；它不是 76 万个核心学习 lemma 的证明，构建必须区分 raw rows、语言单位和核心学习范围。
- 有道历史制品贡献其实际存在的音标、释义、例句、真题、搭配、关系、词族、助记和练习；数组位置不是跨来源 Sense ID。

## 4. JSON 与可复现构建

| 依据                                                                          | 设计决定                                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/json-schema-core) | artifact、candidate 和 AI task 都有版本化 schema；consumer 先校验再处理                            |
| [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785)                        | object key 和 primitive serialization 使用 JCS；领域数组先按稳定业务键排序                         |
| [SLSA provenance](https://slsa.dev/spec/v1.0/provenance)                      | artifact manifest 记录 builder、source digests、Git commit 和构建参数，但不宣称未达到的 SLSA level |
| [PostgreSQL COPY](https://www.postgresql.org/docs/current/sql-copy.html)      | importer 使用流式解析、COPY staging 和集合式 SQL，不逐词远程 insert                                |

JCS 不会替 Sylis 做 Unicode normalization，也不会重排数组。因此 compiler 必须先按版本化 text profile 产生 NFC 字段并按业务键排序，再进行 JCS serialization/hash。

## 5. 题库、测试与学习

| 依据                                                                                                                                                                      | 设计决定                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [1EdTech QTI 3](https://www.1edtech.org/standards/qti/index) 与 [ASI information model](https://developers.imsglobal.org/sites/default/files/spec/qti/v3/info/index.html) | 借鉴 Item、Stimulus、interaction、response declaration、correct response、scoring、feedback、TestPart/Section、selection 和 ordering 的分离 |
| [QTI Usage Data & Item Statistics](https://www.imsglobal.org/sites/default/files/spec/qti/v3/ud-bind/index.html)                                                          | 题目统计按 context 独立于题目正文；难度/区分度不写成永恒属性                                                                                |
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)                                                                                                              | 采用经过维护的 TypeScript scheduler 和不可变参数快照，不继续手写 SM-2 近似算法                                                              |
| [词汇学习原始研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC8638698/)                                                                                                     | 分散练习、检索和纠正反馈共同进入学习流程；提示和反馈需作为一等结构                                                                          |
| [二语完形干扰项研究](https://aclanthology.org/2020.bea-1.10/)                                                                                                             | 干扰项不仅要错误、合理且多样，还要检查其在完整语境中的适配性；AI 输出不能只检查 JSON 格式                                                   |

Sylis 只采用 QTI 的信息分离思想，不在首期实现 QTI XML 导入导出或所有 interaction 类型。QTI 的 ChoiceInteraction 通过 cardinality/max choices 区分单选与多选，inline TextEntry 与 ExtendedText 也不是同一种响应形状；因此 Sylis 不再用一个 `interactionKind` 混合数据类型、数量、呈现位置和评分流程，而显式保存 `responseKind + responseCardinality + responsePlacement + gradingMode`。

## 6. API、发布与安全

| 依据                                                                                                                             | 设计决定                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.1.html)                                                                         | API contract 与 JSON Schema 语义对齐，CI 检查生成文档和 breaking changes                               |
| [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457)                                                               | 所有非 2xx 错误返回统一 `application/problem+json`                                                     |
| [Railway services](https://docs.railway.com/services)                                                                            | API/Web/Admin/Worker/Compiler Runner 从 GitHub source 与各自 Dockerfile 构建；数据库是独立 service     |
| [Railway environments](https://docs.railway.com/environments)                                                                    | staging/production 完全隔离，分别绑定分支、变量、数据库和 AI key                                       |
| [Railway variables](https://docs.railway.com/variables)                                                                          | 业务密钥使用 service-scoped sealed variables；不通过源码、Vite 或 artifact 传递                        |
| [GitHub protected environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) | production deploy 和 lexicon activation 使用 environment protection、branch restriction 和 concurrency |
| [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)                   | 最小权限、集中管理、轮换、撤销、审计；每个进程只得到它需要的密钥                                       |

## 7. 规范冲突时的优先级

1. 数据完整性和可追溯性约束。
2. 对应领域的正式标准语义。
3. 已固定版本的 Sylis artifact/database contract。
4. 来源自身字段和标签。
5. 产品展示偏好。

来源与标准冲突时保留 raw evidence 和 rejected candidate，不让来源字段覆盖正式 vocabulary。标准之间表达粒度不同时保留更精细的可验证结构，再由 API 投影简化展示。
