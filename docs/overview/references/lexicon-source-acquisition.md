# Lexicon source acquisition

本文记录 Sylis lexicon compiler 词典来源的可重复获取方式。调查时间为 2026-08-05，仅把上游项目自己的仓库、发布页、下载页和格式文档当作事实依据。

结论先行：ECDICT 与 Open English WordNet 可以直接固定；Kaikki 的公开文件名会被周期性覆盖，必须先镜像到内容寻址存储；`kajweb/dict` 可以按 Git commit 固定字节，但它是无许可证的有道衍生抓取物，不能作为公开 artifact 的已授权来源。

## 1. 固定规则

一个来源只有同时记录以下值才算被固定：

- 上游身份：release/tag/完整 Git commit，或 Kaikki 的 dump 日期、提取日期和两个 extractor commit；
- 实际输入字节的 SHA-256；
- 不会随 `latest`、`main`、`master` 或定期任务变化的获取位置；
- 容器与内部格式，以及 adapter/extractor 版本；
- 来源权利策略。

网页、搜索结果、单词详情页、在线 API 返回和 README 示例只能证明元数据或格式，不能成为 compiler 的 canonical input。Git blob、release asset 或已经按 SHA-256 镜像的完整 dump 才能成为 canonical bytes。HTTP `ETag`、`Last-Modified`、Git blob SHA-1 也不能替代 source manifest 要求的 SHA-256。

## 2. 推荐来源矩阵

| 来源                 | Canonical input                                                                                                                 | 版本与 SHA-256                                                                                                                    | 容器/内部格式                                                                                    | 结论                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| ECDICT               | commit-pinned `ecdict.csv`                                                                                                      | commit `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`; SHA-256 `1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf`     | 65,933,428-byte UTF-8 CSV                                                                        | 可直接使用                                                |
| Kaikki/Wiktextract   | 完整 `raw-wiktextract-data.jsonl.gz` 下载后写入项目控制的 SHA-256 内容寻址镜像                                                  | 上游页面给 dump/extraction 日期与两个 extractor commit，但不提供不可变历史 URL 或 checksum                                        | gzip 压缩 JSONL；一行一个对象；包含 English Wiktionary 中的所有语言                              | 完成镜像前阻塞 protected pilot                            |
| Open English WordNet | GitHub `2025-edition` release 的 `english-wordnet-2025.xml.gz` asset                                                            | tag commit `dc343f2683279ecbb13fab4e2fd778d7b162d287`; SHA-256 `9ca6d1dcb75f822fdd66617f7d9da48142ace38dd544d6ad5e2feca1674ad3fe` | 11,363,503-byte gzip 压缩 GWA WN-LMF XML                                                         | 可直接使用；选择普通 2025 Edition，不选 2025 Plus/Namenet |
| `kajweb/dict`        | commit `3992bcb94c800a2fd38a9fd6ff95b2353e755363` 下的 81 个 `book/*.zip` Git blobs，或从这些 blobs 制作的内部 immutable bundle | 上游没有 release/tag/checksum；必须计算 bundle 和每个 ZIP 的 SHA-256                                                              | 81 个 ZIP，共 73,983,183 bytes；每个 ZIP 内是按行 JSON 对象，文件后缀虽为 `.json`，语义是 NDJSON | 技术上可重复；公开使用权利阻塞                            |

## 3. ECDICT

### 3.1 官方事实

[ECDICT 官方仓库](https://github.com/skywind3000/ECDICT)说明仓库数据使用 UTF-8 CSV，并列出 `word`、`phonetic`、`definition`、`translation`、`pos`、`collins`、`oxford`、`tag`、`bnc`、`frq`、`exchange`、`detail` 和 `audio` 字段。README 同时说明仓库根部的 `ecdict.csv` 是约 76 万条的基础版本，`stardict.7z` 是另一个压缩数据库制品。

官方 GitHub release 只有 [1.0.28](https://github.com/skywind3000/ECDICT/releases/tag/1.0.28) 等旧 tag；1.0.28 发布于 2017 年，资产是 Eudic/MDX/MOBI/SQLite/StarDict ZIP，而不是当前 raw CSV，GitHub 对这些旧资产也没有发布 SHA-256 digest。因此正式 compiler 不使用旧 release asset。

### 3.2 固定获取

使用以下完整 commit URL，不使用 `master` URL：

```text
https://raw.githubusercontent.com/skywind3000/ECDICT/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/ecdict.csv
```

对应仓库对象可在 [commit-pinned file](https://github.com/skywind3000/ECDICT/blob/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/ecdict.csv) 审查。项目现有 importer 已对该字节流固定上表 SHA-256；首次正式获取仍必须重新计算并比较，不得信任 URL、Content-Length 或 Git blob SHA-1。

该 commit 中 CSV 的 Git blob 是 `c4ade63ea08cf39d9c3475e96929036d64d94c94`；
现有 importer 的完整投影基线是 770,611 个数据 row。blob ID 只作为 Git tree 证据，
770,611 也只是 source rows，不是唯一 lemma 或最终学习词头数量。

### 3.3 200 词处理

无需制造一个新的上游 ECDICT 版本。下载并校验完整 CSV 后，adapter 用固定 headword set 过滤：

1. 用 CSV parser 读取，不能按逗号或物理行手工切割；
2. 按 compiler identity profile 规范化 `word`；
3. 保留所有命中目标集合的完整原始 row；
4. 输出切片时保留 header，并按 `(normalizedHeadword, rawRowSha256)` 排序；
5. 切片 manifest 记录完整 CSV SHA-256、headword set SHA-256、extractor version、row count 和切片 SHA-256。

## 4. Kaikki / Wiktextract

### 4.1 官方端点和格式

[Kaikki raw data page](https://kaikki.org/dictionary/rawdata.html)明确说明文件定期更新，通常至少每周一次；推荐的 raw 端点是：

```text
https://kaikki.org/dictionary/raw-wiktextract-data.jsonl
https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz
```

页面把格式定义为 JSONL，一行一个对象；当前压缩文件约 2.6 GB，解压约 23.1 GB。它来自 English Wiktionary edition，因此包含数百种语言，adapter 必须显式要求 `lang_code == "en"`。Wiktextract 官方也说明输出是逐行 JSON，完整数据不适合整体载入内存，应逐行处理；字段以项目的 TypedDict/映射文档为准，而不是从网页示例反推。[Wiktextract 官方仓库](https://github.com/tatuylonen/wiktextract)

截至调查日，Kaikki 页面显示：

- Wiktionary dump date：`2026-07-06`；
- extraction date：`2026-08-02`；
- Wiktextract commit：[`d9fa2335957c9089ce2c3fb110a075cf072903da`](https://github.com/tatuylonen/wiktextract/commit/d9fa2335957c9089ce2c3fb110a075cf072903da)；
- wikitextprocessor commit：[`9e92f4b53a98748f849ef6186617535abb0fca7b`](https://github.com/tatuylonen/wikitextprocessor/commit/9e92f4b53a98748f849ef6186617535abb0fca7b)。

English language 的 postprocessed 下载 `https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl` 由 [English dictionary page](https://kaikki.org/dictionary/English/index.html)标为将移除的 deprecated website-build data；正式 compiler 不使用它。

### 4.2 版本阻塞

公开 raw URL 没有日期或 digest，官方页面也没有给出历史 archive URL 或 `.sha256` sidecar。2026-08-05 观察到 gzip 响应为 2,840,291,186 bytes，提供 `Last-Modified` 和 nginx `ETag`，但这些都不是官方声明的内容摘要。

因此不能把 manifest 直接永久指向该浮动 URL。首次获取流程必须：

1. 读取 raw page 并记录 dump/extraction/commit 元数据；
2. 一次性流式下载 gzip，同时计算 SHA-256；
3. 下载后再次读取元数据，若页面版本在传输期间变化则作废重来；
4. 以 `sha256/<digest>/raw-wiktextract-data.jsonl.gz` 写入项目控制的 immutable object storage；
5. protected pilot manifest 指向镜像 URI 和实际 SHA-256，`homepageUri` 才指向 Kaikki 页面；
6. 保留 origin URL、Content-Length、上游版本四元组和 acquisition timestamp 作为 provenance，不把它们当完整性证明。

在镜像 URI 与 digest 都未确定前，Kaikki source acquisition 是 protected lexicon pilot 的 blocker。若不建立镜像，唯一更强但成本更高的替代方案是固定 Wikimedia dump 和两个 extractor 的完整 commits 后自行运行 Wiktextract；这会形成 Sylis 自建 extraction，而不是重新取得相同 Kaikki artifact。

Kaikki 页面没有公开它实际读取的 Wikimedia dump URI/checksum、完整 extractor invocation、
Python 版本或 dependency lock。不能根据页面中的 `2026-07-06` 自行拼接 dump URL，
也不能声称固定两个 Git commits 就足以 byte-for-byte 重建 Kaikki artifact。English
extraction 还没有独立的稳定 JSON Schema；adapter 应允许未知字段，同时固定 candidate
schema 和 extractor commits。

### 4.3 200 词切片

Kaikki 是唯一值得物理生成 pilot slice 的大来源。切片算法必须处理完整镜像 gzip，不能调用 200 次网页或 per-word download：

1. 流式 gunzip，逐行 parse JSON；
2. 只保留 `lang_code == "en"` 且 normalized `word` 位于固定目标集合的对象；
3. 同一词头的不同 POS、词源、form-of 和 sense records 全部保留；
4. 用 `(normalizedWord, pos, etymologyNumber, rawLineSha256)` 稳定排序；
5. 输出原始 JSON line bytes 和 LF，不重新美化或合并对象；
6. 记录 parent dump SHA-256、selection SHA-256、算法版本、记录数和 slice SHA-256。

## 5. Open English WordNet

[Open English WordNet 官方仓库](https://github.com/globalwordnet/english-wordnet)说明它以 synset 组织词义并提供 hypernym、antonym、meronym 等关系，发布格式包含 GWA WN-LMF；许可证为 CC BY 4.0。自 2025 release 起，普通词网、含人工验证专名的 Plus 和完整 Namenet 分开。

正式 compiler 使用普通 2025 Edition，避免把 Namenet 大量专名混入成人通用英语目标。准确 release asset 是：

```text
https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition/english-wordnet-2025.xml.gz
```

[2025 release](https://github.com/globalwordnet/english-wordnet/releases/tag/2025-edition)由 tag commit `dc343f2683279ecbb13fab4e2fd778d7b162d287` 固定；GitHub release asset 自带上表 SHA-256 digest。使用 GitHub asset URL，不使用会重定向的 `https://en-word.net/static/...` 别名。解压后是一个 GWA WN-LMF XML 文档，结构按 [Global WordNet schemas](https://globalwordnet.github.io/schemas/) 解析。

实际 asset 的 XML 头声明 `WN-LMF-1.3.dtd`，Lexicon 标识为 `oewn`、language `en`、
version `2025`。验证时应遵守 artifact 自身的 1.3 声明，不能静默套用 schemas 网站当前
更新的版本。其 [LICENSE](https://github.com/globalwordnet/english-wordnet/blob/2025-edition/LICENSE.md)
要求同时归因 Princeton WordNet 与 Open English WordNet team；新增内容为 CC BY 4.0，
底层 Princeton 数据仍带 WordNet License。

压缩文件只有约 11.4 MB，不需要另存 XML 子集。adapter 在完整且已校验的 XML 上选择目标 LexicalEntry，并保留其 Sense、Synset 和 relation evidence。若未来必须输出 standalone WN-LMF slice，必须定义 reference closure；简单删除非目标 LexicalEntry 会留下悬空 relation，不能算有效切片。

`packages/lexicon-compiler/src/sources/oewn.ts` 已按 gzip magic bytes 流式解压，因此可以
直接消费官方 `.xml.gz`，且 source resolver 仍对压缩上游字节验证官方 SHA-256。不能仅按
文件扩展名猜测容器，也不能只记录解压后的 hash 后丢掉官方 digest。

## 6. `kajweb/dict`

### 6.1 它实际包含什么

[`kajweb/dict` README](https://github.com/kajweb/dict/blob/3992bcb94c800a2fd38a9fd6ff95b2353e755363/README.md)自称来源为“X 道背单词(app)”抓取物；目录中的原始下载地址使用 `ydschool-online.nos.netease.com`，书籍标签大量标记“有道”，并记录有道 `dictvoice` 音频参数。因此它应被分类为第三方维护的 Youdao-derived artifact，不是有道官方 SDK、API 或正式数据发行版。

固定 commit [`3992bcb94c800a2fd38a9fd6ff95b2353e755363`](https://github.com/kajweb/dict/commit/3992bcb94c800a2fd38a9fd6ff95b2353e755363) 的 tree 含 81 个 `book/*.zip` Git blobs，总计 73,983,183 bytes。每个 ZIP 保存一本词书；README 要求按行读取，记录顶层包含 `wordRank`、`headWord`、`content`、`bookId`，内部可包含释义、音标、例句、考试题、短语、同近义、同根词和语音请求参数。虽然 ZIP 内文件后缀是 `.json`，它不是一个 JSON array，而是每行一个 JSON object。

代表性复核 `book/1521164643060_CET4_3.zip`：Git blob
`416500cb57d17eaa6a81ab6ae3bd16cc2c1ca0fc`，ZIP `1,719,305` bytes，独立计算
SHA-256 `2732588a69be6f97e831f47baf08fb8f91f699df01607b7cfcf346c8ad2d5f3c`；唯一
member `CET4_3.json` 使用 deflate method 8，解压 `6,129,565` bytes、CRC32
`5d78511d`，可解析 2,607 个 JSONL records。这是格式抽查，不代替 81 个 ZIP 的逐文件
验证。

仓库没有 releases、tags 或 LICENSE，GitHub 也未识别 SPDX license；README 只有收到侵权通知后下架的声明。未知项包括：抓取时间与完整上游版本、81 本书是否同一快照、内容与教材的逐字段授权依据、音频 URL 的再分发权。缺少许可证不等于获得再分发许可。

### 6.2 可重复的私有获取

不得使用 `master`、原始网易 URL 或重新调用未知接口。私有技术验证只能从固定 Git blobs 获取，例如：

```text
https://raw.githubusercontent.com/kajweb/dict/3992bcb94c800a2fd38a9fd6ff95b2353e755363/book/<exact-file-name>.zip
```

获取工具必须从固定 commit tree 枚举且恰好取得 81 个 ZIP，为每个文件计算 SHA-256，再生成按 path 排序的 bundle manifest 和 bundle digest。GitHub auto-generated source archive 可用于传输，但其 tar/zip bytes 不应作为长期 digest 身份；canonical identity 是 commit 下逐个 Git blob 的内容和项目生成的 SHA-256 manifest。

`YOUDAO_NDJSON` adapter 不能直接读取 ZIP。因此 acquisition 必须逐 archive 验证
single member/CRC/record count，JSON parse 每一行，按
`archivePath, bookId, nested wordId, wordRank, canonicalRecordHash` 排序后物化一个 UTF-8
NDJSON。每条记录保留全部原始字段，并新增 source archive/blob metadata 与稳定顶层
`id = bookId:nestedWordId`；缺少 nested `wordId` 时才退化为
`archivePath:lineNumber:recordHash`。adapter 已优先使用顶层 `id`，否则使用
`bookId:nestedWordId` 或 `bookId:rank:wordRank`，并从原始字段生成词书 membership；ZIP 到
NDJSON 的 acquisition 工具仍未实现，因此不构成公开来源可用性。

200 词筛选时流式打开所有 ZIP/NDJSON，按 normalized `headWord` 过滤，保留每本书中的每条命中记录以及 `bookId`/`wordId`。跨书重复事实不能在 acquisition 阶段丢弃；compiler 后续去重事实，同时保留全部 source record 和 membership evidence。

### 6.3 权利 blocker

当前公开 artifact profile 要求 `mayBuild`、`mayServe`、`mayExport` 全为 true。现有官方/仓库材料不能支持对 `kajweb/dict` 设置这些值。因此：

- 它不能进入公开 lexicon artifact 或后续公开 release；
- 若仅做 adapter 技术测试，必须使用隔离、不可发布的内部 profile，并明确 `mayServe=false`、`mayExport=false`；
- 在建立可核验的授权依据前，不得通过 owner approval 把 blocker 改成通过。

## 7. exact-200 可复现流程

仓库的 [`pilot-headwords-v1.json`](../../../packages/lexicon-compiler/data/pilot-headwords-v1.json) 是唯一选择输入：version `pilot-en-v1`，200 个唯一 identity，SHA-256 `b9c0935fa2190cb0a230215daeea274045cd29d1e9eb62bb404fdbd917c3dd8b`。

“exact 200”指最终发布 200 个目标 Headword，不表示每个来源恰好产生 200 条 source records。一个来源可以缺少目标；同一目标也可以产生多个 POS、词源、Sense、Synset 或词书记录。

可重复流程固定为：

1. acquisition 先取得并校验所有完整 canonical inputs；任何下载、digest、版本或 rights 失败都在 parser/AI 之前终止；
2. 校验 headword set 恰好 200 条、identity 唯一且 checksum 相符；
3. 每个 adapter 用同一 identity profile 选择所有命中记录，不按文件顺序取前 200 条；
4. 产生 per-source slice/index manifest，记录 parent digest、selection digest、adapter version、record count 和 output digest；
5. compiler 对所有允许参与该 profile 的来源证据做 identity resolution；每个目标必须至少在其中一个来源中存在，否则失败；
6. validator 证明最终 artifact 恰好 200 个 Headword，并证明每条 derived fact 可回溯到已固定 parent source 和 source record hash。

这个流程不需要把任何网页或在线 API response 当 canonical data。ECDICT、OEWN 和私有 `kajweb` 输入来自固定 Git/release bytes；Kaikki 来自一次完整下载后按 SHA-256 固定的内部镜像。

## 8. Protected pilot blockers

| Blocker                                       | 关闭条件                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Kaikki 浮动 URL 且无官方 checksum/history URL | 完整下载当前选定版本、计算 SHA-256、保存 immutable mirror，并把镜像 URI/digest 写入审核后的 source manifest |
| Kaikki acquisition 期间上游可能轮换           | 下载前后版本四元组一致；不一致则丢弃字节并重来                                                              |
| `kajweb/dict` 无 release/tag/license          | commit + 81-file digest 只能解决重复性，不能解决权利；公开 artifact 仍需可核验授权依据                      |
| `kajweb/dict` 上游快照信息不明                | source provenance 明确标记 `UNKNOWN`，不能伪造日期或把 commit date 当抓取日期                               |
| 有道 ZIP 不是 adapter 的直接输入              | 81-file manifest 和确定性 NDJSON 均固定 SHA-256，稳定 source key 保留跨书 membership                        |
| OEWN relation slice 可能悬空                  | 正式 compiler 直接消费完整 XML；未来 standalone slice 必须实现并验证 reference closure                      |
| exact-200 被误解为每来源 200 rows             | 门禁分别统计 target identities、source records、Entries/Senses/Synsets；只对最终 Headword 数量要求恰好 200  |
