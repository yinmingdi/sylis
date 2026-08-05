# `packages/lexicon-compiler`

## 1. Package contract

```json
{
  "name": "@sylis/lexicon-compiler",
  "private": true,
  "type": "module",
  "dependencies": {
    "@sylis/lexicon-contracts": "workspace:*",
    "@sylis/ai-provider": "workspace:*"
  }
}
```

它是独立 workspace package，不是 NestJS service。允许 Node 标准库、streaming parser/writer、schema validator 和 provider-neutral `StructuredGenerationPort`；禁止直接依赖 AI SDK、`@prisma/client`、API module、Railway CLI 或生产数据库。DeepSeek adapter 只在本地 CLI 或独立 Compiler Runner 的 composition root 装配，编译 pipeline 只接收注入端口。

Artifact 公共契约不放在 compiler 内，而在 sibling package：

```text
packages/lexicon-contracts/
  src/schema/artifact-v1.schema.json
  src/types/artifact-v1.ts
  src/types/controlled-vocabularies.ts
  src/validators/shape.ts
  src/validators/references.ts
```

它不依赖 compiler、importer、NestJS 或 Prisma。compiler 和 importer 都只向它依赖，第三方可单独取得 JSON Schema。compiler 内仍拥有 candidate schema 和语言学/题目语义验证，因为这些不是 artifact consumer contract。

## 2. 目录

```text
packages/lexicon-compiler/
  package.json
  tsconfig.json
  README.md
  src/
    cli/
      main.ts
      composition.ts
    candidates/
      candidate-v1.ts
    manifest/
      source-manifest.ts
    materialize/
      external-sort.ts
      source-slice.ts
      kaikki-mirror.ts
    sources/
      ecdict.ts
      wiktextract.ts
      oewn.ts
      youdao.ts
    normalize/
      text-profile.ts
      vocabulary-map.ts
    resolve/
      headword.ts
      entry.ts
      form.ts
      sense.ts
      concept.ts
      relation.ts
    enrich/
      task-planner.ts
      structured-enricher.ts
      schemas/
    pedagogy/
      material-planner.ts
      material-candidates.ts
      material-validator.ts
      material-deduplicator.ts
    learning/
      objective-planner.ts
      objective-builder.ts
      stimulus-builder.ts
      exercise-candidates.ts
      exercise-task-matrix.ts
      distractor-pool.ts
      blueprint-builder.ts
    validate/
      linguistics.ts
      exercises.ts
      profiles.ts
    export/
      artifact-writer.ts
      canonicalize.ts
    progress/
      reporter.ts
  test/
    fixtures/
    golden/
```

## 3. CLI

```bash
# 下载/校验 manifest 中的公开来源；有道路径只从参数或环境变量传入
pnpm --filter @sylis/lexicon-compiler sources:fetch \
  --manifest "$PWD/lexicon.sources.json"

# 下载 Kaikki 全量 gzip；下载前后核对版本四元组，再按 SHA-256 写入本地不可变镜像
pnpm --filter @sylis/lexicon-compiler sources:mirror-kaikki \
  --mirror-root "$PWD/.work/source-mirror"

# 校验本地 checksum 后按内容寻址 key 发布到私有 S3-compatible object storage
pnpm --filter @sylis/lexicon-compiler sources:publish-object \
  --input "$PWD/.work/source-mirror/sha256/<parent-sha256>/raw-wiktextract-data.jsonl.gz" \
  --sha256 <parent-sha256> \
  --object-name raw-wiktextract-data.jsonl.gz \
  --content-type application/gzip

# 从固定全量来源筛出 headword set 的全部命中记录，并生成确定性 slice manifest
pnpm --filter @sylis/lexicon-compiler sources:slice \
  --adapter WIKTEXTRACT_EN \
  --input "$PWD/.work/source-mirror/sha256/<parent-sha256>/raw-wiktextract-data.jsonl.gz" \
  --parent-uri https://objects.example/sha256/<parent-sha256>/raw-wiktextract-data.jsonl.gz \
  --parent-sha256 <parent-sha256> \
  --headwords "$PWD/packages/lexicon-compiler/data/pilot-headwords-v1.json" \
  --headword-version pilot-en-v1 \
  --headword-sha256 b9c0935fa2190cb0a230215daeea274045cd29d1e9eb62bb404fdbd917c3dd8b \
  --output "$PWD/.work/phase-1-pilot-input/kaikki-en.jsonl" \
  --metadata-output "$PWD/.work/phase-1-pilot-input/kaikki-en.slice.json"

# 200 词真实 pilot，允许 AI，输出到被 gitignore 的 work 目录
pnpm --filter @sylis/lexicon-compiler compile \
  --manifest "$PWD/lexicon.sources.json" \
  --profile pilot-200 \
  --output "$PWD/.work/sylis-lexicon-v1.json.zst"

# 纯校验，不调用 AI、不联网、不写数据库
pnpm --filter @sylis/lexicon-compiler validate \
  --input "$PWD/.work/sylis-lexicon-v1.json.zst"

# 本地全量诊断构建；正式全量构建由 Railway Compiler Runner 执行
pnpm --filter @sylis/lexicon-compiler compile \
  --manifest "$PWD/lexicon.sources.json" \
  --profile core-20000 \
  --resume run-id \
  --output "$PWD/.work/sylis-lexicon-v1.json.zst"
```

`wiktextract-headword-slice/v2` 仍按顶层 JSON object 做流式 framing，但兼容 Kaikki dump 中字符串内部未转义的物理换行：物化器只把该位置确定性编码为 JSON `\n`，不会合并或跳过其他畸形 JSON。无法解析的逻辑记录只报告物理行号、byte length 与 SHA-256，不把来源正文写入日志；成功、解析失败或解压失败时都必须关闭 file、meter、gunzip 与 readline 整条流。

CLI exit code：`0` 成功；`2` 输入/配置错误；`3` source checksum 错；`4` candidate/schema 错；`5` 质量门禁未通过；`6` 预算耗尽；`7` 可重试外部错误。预算耗尽不得输出“正式完成”的 artifact。

## 4. Source manifest

```json
{
  "manifestVersion": "sylis.source-manifest/1",
  "release": {
    "lexiconKey": "sylis-en-zh",
    "releaseVersion": "2026.08.05.1",
    "sourceLanguageTag": "en",
    "learningLanguageTags": ["zh-CN"],
    "compilerVersion": "1.0.0",
    "gitCommit": "0000000000000000000000000000000000000000"
  },
  "selection": {
    "headwordSet": {
      "version": "pilot-en-v1",
      "path": "./data/pilot-headwords-v1.json",
      "sha256": "b9c0935fa2190cb0a230215daeea274045cd29d1e9eb62bb404fdbd917c3dd8b"
    }
  },
  "sources": [
    {
      "key": "ecdict",
      "version": "git-bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b",
      "uri": "https://raw.githubusercontent.com/skywind3000/ECDICT/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/ecdict.csv",
      "sha256": "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf",
      "adapter": "ECDICT",
      "rights": {
        "mayBuild": true,
        "mayServe": true,
        "mayExport": true,
        "requiresAttribution": false
      }
    },
    {
      "key": "kaikki-en",
      "version": "enwiktionary-2026-07-06-extracted-2026-08-02",
      "pathEnv": "KAIKKI_PILOT_SLICE_PATH",
      "sha256Env": "KAIKKI_PILOT_SLICE_SHA256",
      "adapter": "WIKTEXTRACT_EN",
      "materialization": {
        "parentUri": "https://objects.example/sha256/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/raw-wiktextract-data.jsonl.gz",
        "parentSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "selectionSha256": "b9c0935fa2190cb0a230215daeea274045cd29d1e9eb62bb404fdbd917c3dd8b",
        "materializerVersion": "wiktextract-headword-slice/v2",
        "recordCount": 1234
      },
      "rights": {
        "mayBuild": true,
        "mayServe": true,
        "mayExport": true,
        "requiresAttribution": true,
        "attribution": "<approved attribution text>"
      }
    },
    {
      "key": "oewn",
      "version": "2025-edition",
      "uri": "https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition/english-wordnet-2025.xml.gz",
      "sha256": "9ca6d1dcb75f822fdd66617f7d9da48142ace38dd544d6ad5e2feca1674ad3fe",
      "adapter": "WN_LMF",
      "rights": {
        "mayBuild": true,
        "mayServe": true,
        "mayExport": true,
        "requiresAttribution": true,
        "attribution": "<approved attribution text>"
      }
    }
  ],
  "pedagogy": {
    "audienceProfileKey": "zh-general-adult-en-v1",
    "learningLanguageTag": "en",
    "supportLanguageTag": "zh-CN",
    "richTargetSet": {
      "version": "pilot-rich-en-v1",
      "path": "./data/pilot-rich-targets-v1.json",
      "sha256": "2284d4da116ca78c955ef34d61c08c5af3d74e5cdb96ecdc23240287f1ac24d3"
    }
  }
}
```

禁止未固定 checksum 的 URL、headword set 或 rich target set。完整上游文件直接作为 compiler input 时 `materialization` 省略；派生切片必须同时记录不可变 `parentUri`、parent SHA-256、selection SHA-256、materializer version 和 adapter 实际读取的 record count。compiler 要求 selection checksum 等于 manifest 的 headword set checksum，并在 AI 调用前验证实际 record count。artifact 会把完整 materialization 闭包写入 `manifest.inputs.sources[]`，不能只记录切片自身 checksum 后丢失 parent。

`sources:slice` 在读取前同时验证 parent 与 headword set checksum。ECDICT 使用 CSV parser 保留 header 和完整 raw record；Kaikki 流式 gunzip、要求 `lang_code == "en"`，并保留每个目标的全部 POS、词源和 form-of records。命中记录通过有界内存、磁盘分段排序输出，metadata 固定 parent/selection/materializer、record count、byte size 与 output SHA-256。CLI 在 stderr 对 verify-parent、scan、write、install 分阶段报告输入字节和命中记录数，额外在 stdout 打印可直接复制到 source manifest 的 `sourceManifestInput`，但不会自动改写受审 manifest。

`pnpm --filter` 会把 package script 的进程目录设为 package 根目录，因此仓库级输入/输出必须像上例一样在 shell 展开 `$PWD` 后传入绝对路径；不能假设 `./.work` 仍指 workspace 根目录。

`sources:mirror-kaikki` 先读取官方 metadata，取得响应长度后检查目标文件系统至少还能容纳完整对象和 512 MiB 安全余量，流式下载 gzip 并计算 SHA-256，再次读取 metadata；dump date、extraction date、Wiktextract commit 或 wikitextprocessor commit 任一变化就删除临时下载并失败。命令在 stderr 按 metadata-before、download、metadata-after、install 输出进度；download 至少每 5 秒或 64 MiB 报告已下载量、总量、平均速率和 ETA，不能让外部通过 CPU/内存猜进度。成功字节写入 `sha256/<digest>/raw-wiktextract-data.jsonl.gz`，已有同 digest 对象会重新校验而不会覆盖。本地 `file:` URI 只适合本地验证；protected/production manifest 的 `parentUri` 必须换成项目控制、禁止覆盖的对象存储 URI，并保持相同 digest。

`sources:publish-object` 从标准 `AWS_ENDPOINT_URL`、`AWS_DEFAULT_REGION`、`AWS_S3_BUCKET_NAME`、`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY` 与 `AWS_S3_URL_STYLE` 读取私有 S3-compatible 配置。命令重新计算本地 SHA-256，使用 `sha256/<digest>/<object-name>` 作为唯一 key；远端对象已存在时必须同时匹配 byte size 和 `sha256` metadata 才能复用，否则失败。新对象通过有界并发 multipart 上传，完成后重新 HEAD 校验，只输出稳定 `s3://bucket/key`、checksum、size 和 reuse 状态，不输出 endpoint 或凭据。Railway Bucket 当前不提供 versioning/object lock，因此不可变性来自内容寻址 key、上传前后校验以及只允许这条 publisher 路径写入；临时 presigned URL 不得进入 manifest。仅在供应商 DNS 某个边缘地址故障的受控诊断中允许用 `AWS_ENDPOINT_IP` 固定 socket 目标；TLS SNI、证书和 HTTP Host 仍使用 `AWS_ENDPOINT_URL`，该 IP 不得写入 manifest 或长期配置。

每个 source 必须显式给出 rights，不能以缺省值推断为允许；`requiresAttribution=true` 时 attribution 不能为空。公开标准 JSON 构建只接受 `mayBuild/mayServe/mayExport` 全部为 true 的来源，任何 false 都在读取或 AI 调用前失败。`kajweb/dict` 只能用于隔离的 adapter fixture 和私有技术验证；在获得可核验授权依据前不得出现在上述公开 manifest，也不得把 owner approval 写成 rights basis。若未来需要仅用于内部候选、不可服务或不可导出的来源，必须新增明确的非公开 build profile、输出边界和 ADR，不能复用当前 public artifact 模式。

source manifest 模板可以提交，私有路径和凭据不可提交；包含最终 `release.gitCommit` 的运行 manifest 不能声称与自身所在 commit 相同，因为修改该字段本身会产生新 commit。protected pilot 必须先确定并 checkout 干净目标 commit，再从已审核模板把 `release.gitCommit` 物化为该 `HEAD`，把结果写到 gitignored `.work` 或工作树外的受保护路径，并让 `LEXICON_SOURCE_MANIFEST` 指向这份运行 manifest。脚本记录运行 manifest 的实际 SHA-256，模板、运行 manifest 或目标 commit 任一变化都必须重新开始 pilot。DictionaryByGPT4 不出现在 `sources`：项目只借鉴其内容维度，现成 `word + content` NDJSON 不进入 compiler。

```bash
pnpm phase1:pilot:prepare -- \
  --template ./pilot-source-manifest.template.json \
  --output ./.work/phase-1-pilot-input/source-manifest.json

export LEXICON_SOURCE_MANIFEST="$PWD/.work/phase-1-pilot-input/source-manifest.json"
pnpm phase1:pilot
```

prepare 命令拒绝任何 tracked/staged diff，也拒绝 `packages/ai-provider`、`packages/lexicon-contracts`、`packages/lexicon-compiler`、`tools/architecture` 和相关根配置中的未跟踪文件；这些条件证明执行代码与 `HEAD` 一致。Phase 1 所有权外的未跟踪个人文件不会参与 compiler，也不会再无意义地阻塞 pilot。命令不修改模板；它固定当前 `HEAD`，并把模板中的相对本地 source/headword/rich-target 路径解析为绝对路径，避免运行 manifest 移到 `.work` 后改变路径语义。它只输出路径、commit 和 manifest SHA-256，不解析或打印任何 source checksum 环境变量与密钥。

### 4.1 固定词头集合

正式 profile 不再按来源文件顺序截取“最先出现的 N 个词”。`pilot-200` 必须引用恰好 200 个目标的 `sylis.headword-set/1`，`core-20000` 必须引用恰好 20,000 个目标；`fixture` 可以省略 selection，此时读取 fixture 的全部记录。文件只保存稳定 identity 所需字段：

```json
{
  "headwordSetVersion": "sylis.headword-set/1",
  "version": "pilot-en-v1",
  "headwords": [
    { "languageTag": "en", "normalizedHeadword": "bank" },
    { "languageTag": "en", "normalizedHeadword": "run" }
  ]
}
```

`(languageTag, normalizedHeadword)` 必须唯一，词头必须已按 compiler identity profile 做 NFC、首尾空白和连续空白规范化。compiler 会从每个来源保留所有命中记录，而不是找到首个来源后停止；任一目标在所有来源中都不存在、不能发布为 Headword、数量不符、版本不符或 checksum 不符都阻止构建。`richTargetSet.targets` 必须是固定词头集合的子集。

仓库中的 `packages/lexicon-compiler/data/pilot-headwords-v1.json` 是可审查的 200 词 baseline。它列独立发布目标；`run` 来源记录带入 `runs/ran` Form，`helpful` 带入 `helpful advice` Collocation，`prevent` 带入 `prevent sb from doing sth` Frame。这些附属结构不能冒充额外 Headword 来凑数。`packages/lexicon-compiler/data/pilot-rich-targets-v1.json` 是对应的受控 AI/教学增强子集；v1 只把 `helpful` 的形容词义项用于助记、微故事、学习提示和练习生成，其 SHA-256 固定为 `2284d4da116ca78c955ef34d61c08c5af3d74e5cdb96ecdc23240287f1ac24d3`。变更任一集合都必须升级 version、更新 checksum、重新人工审核，并使旧 checkpoint/cache 失效。

compiler 使用两个不同作用域的 hash。source-records hash 只绑定 profile、headword set 的 version/checksum/排序 identity 集、每个 source 的 key/version/adapter/实际 SHA-256/source URI，以及 git code、compiler、artifact schema 和 source handler version；`sha256Env` 的变量名不能代替实际值。完整 run hash 另外绑定 manifest、rich target set 和 AI 模型、prompt、预算、定价及并发配置。这样 no-AI、真实 AI 与 cache replay 可共享完全相同的已解析来源记录，但不能错误复用后续 AI/学习阶段。每次 compile 在读取共享 checkpoint 前仍重新计算原始来源 SHA-256。manifest 文本、来源顺序或来源记录顺序不得改变最终 canonical artifact；来源顺序可以改变 run identity，但不能改变发布内容。

## 5. 固定处理阶段

1. `PREFLIGHT`：manifest schema、rights、实际 checksum、工作集、磁盘、预算、模型 probe；本地输入失败时不得先调用 provider。
2. `SOURCE_RECORDS`：流式读取并生成稳定 source key/hash。
3. `NORMALIZE`：BCP 47、NFC、受控 vocabulary 和 typed candidates。
4. `HEADWORD_RESOLUTION`：语言 + identity，不按简单 lowercase 破坏专名。
5. `ENTRY_RESOLUTION`：词头、POS、形态模式、词源证据；不同 POS 拆 Entry。
6. `FORM_PROJECTION`：forms/form-of/features；过去分词四态判定。
7. `SENSE_ALIGNMENT`：Entry 内语义签名对齐，禁止数组位置合并。
8. `CONCEPT_CLUSTERING`：等价 Sense 共享 Concept，近义仅建 relation。
9. `CONTENT_BINDING`：定义、翻译、例句、搭配、用法和 citations 绑定 Sense。
10. `RELATION_RESOLUTION`：解析正式 typed target；未解析者留 candidate。
11. `MORPH_SYNSEM_ETYMOLOGY`：形态、构词、Frame、predicate、词源。
12. `FACT_GAP_FILL`：只处理 profile 允许由 AI 提出的定义、例句、关系解析等词典 candidate；不得生成整篇单词文章。
13. `OBJECTIVE_PLANNING`：按知识维度、接受/产出方向和 typed subject 建立 Objective。
14. `PEDAGOGICAL_MATERIALS`：按证据资格和 manifest rich target set 规划、生成、验证、去重教学材料。
15. `EXERCISES_BLUEPRINTS`：按受控 task/evidence/response/grading 矩阵生成或复用 Stimulus、Exercise 和 assessment blueprint；可引用已发布 material candidate。
16. `GLOBAL_VALIDATION`：引用、关系、provenance、rights、coverage、教学材料和题目质量。
17. `EXPORT`：稳定排序、流式写一个 JSON object 并接入 zstd、计算 compressed/content 两种 hash、重新流式读取验收。

共享 source checkpoint 写入 `.work/lexicon-compiler/source-records/<sourceHash>.checkpoint.json`；run 专属输出写入 `.work/lexicon-compiler/<runId>/`，全部 gitignore。checkpoint v2 分别保存 `SOURCE_RECORDS`、`RELATION_RESOLUTION` 和 `LEARNING_CONTENT`，并按各自作用域绑定 input hash、headword-set version/checksum/identities、git code version、compiler/schema/handler version。source checkpoint 在 source-records hash 相同的构建间自动复用；Relation 和学习内容 checkpoint 只有显式 `--resume <runId>` 才能跳过阶段，避免 protected pilot 的第二次构建绕过 AI candidate-cache replay。AI 阶段中途重启从 source/Relation checkpoint 继续，已完成 task 由加密 candidate cache 恢复。

## 6. Identity resolution

### Headword

- NFC + language 是 identity 基础；大小写处理按语言 profile。
- search key 可以做 casefold、diacritic/compatibility 辅助，但不改变 identity。
- 标点、空格和 multiword tokenization 由 versioned profile 处理。

### Entry

- POS 不同必须拆开。
- 同 POS 但词源、形态范式或核心 Sense 集不同可拆同形词 Entry。
- `homographNo` 只是展示顺序，不进入 stable identity key。

### Form 与独立 Entry

对每个 surface candidate 收集 `form_of`、POS section、definition、usage、frequency、etymology 等证据：

| 结果               | 条件                                          | 正式投影                      |
| ------------------ | --------------------------------------------- | ----------------------------- |
| `INFLECTED_ONLY`   | 只有可靠 form-of/inflection，没独立 POS+Sense | 父 Entry 下 Form              |
| `INDEPENDENT_ONLY` | 有独立 POS+Sense，无可靠 form-of              | 独立 Entry                    |
| `BOTH`             | 同时满足两组证据                              | Form + 独立 Entry，各自 facts |
| `UNRESOLVED`       | 证据冲突或不足                                | QA issue，不 promotion        |

Wiktextract 是主要结构证据，ECDICT exchange 是辅助形态证据，AI 只能解释证据，不能单独改变结论。

## 7. 工作集与规模

目标不是把 70 多万 raw row 全部 AI enrich。构建先保留完整 source catalog，再按以下集合输出产品 release：

- 81 个有道词书 membership 全保留；
- 约 2 万核心 lemma 做 `LEARNER_CORE`/`STUDY_READY` 丰富；
- 每个 STUDY_READY Sense 生成或复用 learner explanation；构词/文化材料只对 evidence-eligible target 生成；mnemonic/micro-story 只处理 checksum 固定的 rich target set；
- 核心 lemma 必要的 forms、multiword、relations target 和 concept 邻接点按依赖闭包加入；
- 超出范围的 raw record 留来源缓存，不进入本 release 或以最低可发布 profile 进入。

profile 选择和实际 count 写进 manifest，不能把 raw row 数称为单词数。

## 8. 输出确定性

- source records 按 `(datasetVersion, sourceKey)` 排序；所有实体按 stable business key 排序。
- UUID 使用 namespace + identity key 的确定性 ID 或持久化 identity map；随机 build ID 不进入内容 hash。
- 时间戳、run ID、数据库 ID 和状态不进入 canonical content payload。
- JCS 处理 object key/primitive；domain canonicalizer 明确处理 array order。
- 相同输入、commit、schema、model response cache 和配置必须产生相同 content hash。

## 9. Public library API

```typescript
export interface CompileOptions {
  manifestPath: string;
  profile: "fixture" | "pilot-200" | "core-20000";
  outputPath: string;
  resumeRunId?: string;
  ai?: { enabled: boolean; budgetUsd: string; concurrency: number };
}

export interface CompileDependencies {
  structuredGeneration?: StructuredGenerationPort;
  progress: CompileProgressPort;
}

export async function compileLexicon(
  options: CompileOptions,
  dependencies: CompileDependencies,
): Promise<CompileResult>;
export async function validateArtifactStream(
  inputPath: string,
  options?: ArtifactStreamValidationOptions,
): Promise<ArtifactStreamValidationResult>;
```

package 根入口只公开上述 compile、stream validation、结果类型和 `CompileProgressPort`。candidate、source adapter、resolver、enricher、checkpoint、cache、canonical writer 与具体 validator 都是实现；Runner 和 importer 不得 deep import。测试需要的内存 cache 和受保护环境覆盖通过包内 internal seam 注入，不扩大公共 interface。

`sylisLexiconArtifactV1Schema`、artifact TypeScript types 和通用 shape/reference validator 由 `@sylis/lexicon-contracts` 导出。importer 不依赖 compiler，也不调用 compiler pipeline。

当 `ai.enabled=true` 时缺少 `structuredGeneration` 必须在 PREFLIGHT 失败；port 还必须先通过一次 strict structured-output capability probe，失败时不得读取 source 或执行任何生成 task。禁用 AI 时 pipeline 不加载 provider adapter。本地 `src/cli/composition.ts` 可从 validated compiler-only 环境创建 DeepSeek adapter；正式构建由 Runner 注入同一 port，library test 注入 fake。Compiler 不接收 `StreamingGenerationPort`，因为 artifact enrichment 只允许 schema-validated structured result。

## 10. 本地先行门禁

任何全量构建前必须依次通过：fixture、无 AI pilot、真实 AI 200 词 pilot、golden diff、预算预测。pilot 覆盖规则词、不规则词、多义词、同形词、multiword、affix、过去分词、词源冲突、来源缺失、五类 PedagogicalMaterial、material-as-stimulus 和含真题/练习的有道记录。

## 11. Railway Compiler Runner

正式全量构建不在 API、通用 Worker 或 GitHub Actions 长时间运行，而由独立 `@sylis/lexicon-compiler-runner` 执行：

```text
services/lexicon-compiler-runner/
  src/
    main.ts
    runner.module.ts
    runtime/       claim、lease、checkpoint、progress、shutdown
    handlers/      lexicon-build.handler.ts
    adapters/      database、object-storage、ai-provider、source-fetch
```

Runner 只 claim `LEXICON_BUILD`，从 typed `BuildRun` 读取已批准 manifest/profile/budget/model policy，装配 source fetch、DeepSeek `StructuredGenerationPort`、artifact storage 和 progress port，再调用 `compileLexicon`。阶段 checkpoint 同时记录 input hash、compiler/schema/handler version 与对象存储中的可恢复中间制品；Railway 重启后只有 hash/version 全匹配才 resume。

Runner 将 stage、processed/total、吞吐、AI token/cost、warning 和 heartbeat 写入统一 `BackgroundJob`；最终只上传通过 schema、语义、rights、content hash 和重新流式读取验收的 `sylis-lexicon-v1.json.zst`，并把不可变 artifact URI/hash 作为 result reference。它不执行 import、validation activation 或 production DB 词典写入。

GitHub protected workflow 负责代码/manifest/pilot/预算审批以及 artifact publish/activation 门禁；Railway 承担长计算。详细目录与依赖见 [后端目录与 NestJS 模块边界](../implementation/backend-structure.md)，CI 与权限见 [CI/CD、Railway 与密钥](../delivery/cicd-security.md)。
