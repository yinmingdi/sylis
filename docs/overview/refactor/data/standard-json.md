# Sylis 标准 JSON 文件介绍与字段字典

## 1. 定位

最终物理文件名固定为 `sylis-lexicon-v1.json.zst`。它是一个 Zstandard 压缩文件，解压后恰好包含一个 UTF-8 编码、无 BOM 的合法 JSON object；不能是 JSONL、tar/zip 容器、多个 JSON 文档或附带 sidecar。这个单文件是：

- compiler 的唯一正式输出；
- importer 的唯一词典输入；
- 可供第三方离线消费的自描述数据集；
- 一次完整、不可变、可验证的 release build 输入。

它不是 API 的 `HeadwordDetail`，也不包含用户数据。API 按需要将关系数组投影为嵌套页面结构。

机器可读的 [JSON Schema 2020-12](./schemas/sylis-lexicon-artifact-v1.schema.json) 是字段、required/null、typed union 和 `additionalProperties` 的唯一结构真相。本页是与 Schema 对齐的人类可读说明，面向 compiler/importer 开发者、API 聚合层和第三方离线消费者。`@sylis/lexicon-contracts` 从 Schema 生成 TypeScript 类型，并追加纯引用与业务语义验证器；compiler 与 importer 都依赖该包，互不依赖。

[最小合法 Artifact](./examples/minimal-artifact.json) 由正式 Schema 确定性生成并纳入 Phase 0 门禁，用来证明所有 required 章节和空实体集合的基线形状；它不代表可发布的内容质量，真实 release 仍必须通过引用、计数、profile 和语义验证。

## 2. 顶层结构

下面是根结构示意；空 object 只表示章节位置，不是可导入 Artifact：

```text
{
  "schemaVersion": "sylis.lexicon-artifact/1",
  "manifest": {},
  "vocabularies": {},
  "sources": {},
  "provenance": {},
  "lexicon": {},
  "learning": {},
  "quality": {}
}
```

| 顶层字段        | 类型   | 含义                                                                   |
| --------------- | ------ | ---------------------------------------------------------------------- |
| `schemaVersion` | string | 固定为 `sylis.lexicon-artifact/1`；consumer 据此选择兼容的 validator   |
| `manifest`      | object | 本 release 的语言、构建工具、文本规则、内容哈希和集合计数              |
| `vocabularies`  | object | POS、语法特征、关系类型等受控词表及其精确版本                          |
| `sources`       | object | ECDICT、Wiktionary/Kaikki、有道等输入数据集、版本、记录和权利策略      |
| `provenance`    | object | 正式内容的决策 bundle，以及它引用的直接、派生或生成证据                |
| `lexicon`       | object | 词头、词条、词形、义项、关系、例句、搭配、句法语义、形态、词源和语料图 |
| `learning`      | object | 词书、能力等级、学习目标、教学材料、题目、刺激材料和测评蓝图           |
| `quality`       | object | 内容 profile、逐目标覆盖结果、来源/题目统计和验证摘要                  |

根对象及其七个成员都禁止未知字段。Schema 共有 110 个 array-valued property：`manifest.learningLanguageTags` 与 `manifest.inputs.sources` 是两个元数据列表，其余 108 个是必须出现的实体集合；实体集合没有数据时输出 `[]`，不能省略。

### 2.1 受控词表、来源、证据与质量

| Object         | Required members                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `vocabularies` | `bundles`, `namespaceVersions`, `terms`                                                                                      |
| `sources`      | `datasets`, `datasetVersions`, `records`, `rightsPolicies`, `restrictions`                                                   |
| `provenance`   | `bundles`, `evidence`                                                                                                        |
| `quality`      | `profiles`, `profileVersions`, `profileEvaluations`, `profileEvaluationTargets`, `coverage`, `validationSummary`, statistics |

Schema 允许 `sources.records` 表达 normalized raw payload，或仅表达 `rawPayloadHash + rawPayloadUri`，但当前 public release profile 只接受 `mayBuild/mayServe/mayExport` 全为 true 的来源并嵌入允许公开的 payload；不能用 `rawPayload=null` 绕过不可导出来源后继续发布其派生事实。未来若新增 candidate-only/internal profile，才可在独立不可公开边界使用 URI 形式。`quality` 只放可公开、可机读的结果摘要，不放 provider response、受限 prompt 或所有内部 candidate。

`manifest.contentHash` 对解压后的 JSON 删除 `/manifest/contentHash` 后进行 canonicalization 并计算。Artifact 不包含运行时 BuildRun ID、数据库 ID 或构建时间；因此相同固定输入、工具版本、模型响应缓存和配置产生相同 canonical bytes。物理 `.json.zst` 的 `artifactSha256`、byte size、构建时间和 BuildRun ID 属于 GitHub Release/BuildRun 运维元数据，不进入单文件内容。

## 3. Manifest

```json
{
  "schemaVersion": "sylis.lexicon-artifact/1",
  "manifest": {
    "lexiconKey": "sylis-en-zh",
    "releaseVersion": "2026.08.04.1",
    "sourceLanguageTag": "en",
    "learningLanguageTags": ["zh-CN"],
    "builder": {
      "package": "@sylis/lexicon-compiler",
      "version": "1.0.0",
      "gitCommit": "0000000000000000000000000000000000000000"
    },
    "build": {
      "compileProfile": "core-20000",
      "validatorVersion": "lexicon-compiler-global/1"
    },
    "inputs": {
      "sourceManifestVersion": "sylis.source-manifest/1",
      "sources": [
        {
          "key": "kaikki-en",
          "version": "2026-07-01",
          "adapter": "WIKTEXTRACT_EN",
          "checksum": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
          "materialization": {
            "parentUri": "https://objects.example/sha256/parent/raw-wiktextract-data.jsonl.gz",
            "parentChecksum": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
            "selectionChecksum": "sha256:2222222222222222222222222222222222222222222222222222222222222222",
            "materializerVersion": "wiktextract-headword-slice/v2",
            "recordCount": 1234
          }
        }
      ],
      "headwordSet": {
        "schemaVersion": "sylis.headword-set/1",
        "version": "core-20000-v1",
        "checksum": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
      },
      "richTargetSet": {
        "schemaVersion": "sylis.rich-target-set/1",
        "version": "core-rich-v1",
        "checksum": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
      }
    },
    "ai": {
      "enabled": true,
      "promptVersion": "lexicon-enrichment-prompts/v1",
      "candidateSchemaVersion": "sylis.ai-candidate/1",
      "modelPolicyVersion": "compiler-ai-policy/v1:deepseek-chat",
      "requestedIdentity": {
        "provider": "deepseek",
        "model": "deepseek-chat"
      },
      "resolvedIdentity": {
        "provider": "deepseek",
        "model": "deepseek-chat-2026-07"
      }
    },
    "textProfile": {
      "normalization": "NFC",
      "unicodeVersion": "17.0.0",
      "segmentation": "UAX29",
      "cldrVersion": "48",
      "locale": "en"
    },
    "canonicalization": "RFC8785+domain-array-order/1",
    "contentHash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    "counts": {
      "/lexicon/headwords": 20000,
      "/lexicon/headwordRevisions": 20000,
      "/lexicon/entries": 0,
      "/lexicon/entryRevisions": 0,
      "/lexicon/forms": 0,
      "/lexicon/senses": 0,
      "/lexicon/senseRevisions": 0,
      "/lexicon/concepts": 0,
      "/learning/learningObjectives": 0,
      "/learning/exerciseItems": 0
    }
  }
}
```

| Manifest 字段                  | 含义                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `lexiconKey`                   | 词典产品的稳定业务键，例如英汉词典 `sylis-en-zh`                                             |
| `releaseVersion`               | 这次不可变内容发布的版本，不是数据库 ID                                                      |
| `sourceLanguageTag`            | 被学习、被检索的源语言 BCP 47 标签                                                           |
| `learningLanguageTags`         | 释义、翻译和教学内容支持的学习语言标签；至少一个且不能重复                                   |
| `builder.package`              | 固定为 `@sylis/lexicon-compiler`                                                             |
| `builder.version`              | 生成 Artifact 的 compiler 版本                                                               |
| `builder.gitCommit`            | 生成时源码的 40 位 Git commit，用于复现                                                      |
| `build.compileProfile`         | 固定本次构建使用的 `fixture`、`pilot-200` 或 `core-20000` 内容门禁                           |
| `build.validatorVersion`       | 生成并验收该 Artifact 的全局 validator 版本                                                  |
| `inputs.sourceManifestVersion` | 解释来源清单的 contract 版本                                                                 |
| `inputs.sources`               | 按 key 稳定排序的来源版本、adapter 与实际解析字节 SHA-256；不记录本地路径或密钥              |
| `inputs.headwordSet`           | 词头选择集合的 schema/version/checksum；未使用时为 `null`                                    |
| `inputs.richTargetSet`         | AI/教学增强目标集合的 schema/version/checksum；未使用时为 `null`                             |
| `ai.enabled`                   | 是否允许 AI 参与该 Artifact；为 `false` 时其余 AI 字段必须全部为 `null`                      |
| `ai.promptVersion`             | 编译 prompt contract 版本，不保存 prompt 正文                                                |
| `ai.candidateSchemaVersion`    | AI strict structured candidate 的 Schema 版本                                                |
| `ai.modelPolicyVersion`        | 模型选择、fallback 和能力要求的策略版本                                                      |
| `ai.requestedIdentity`         | compiler 请求的 provider/model                                                               |
| `ai.resolvedIdentity`          | capability probe 实际返回的 provider/model；后续每个响应必须保持一致                         |
| `textProfile.normalization`    | 固定为 NFC；所有 offset、比较和 hash 都基于该规范化约定                                      |
| `textProfile.unicodeVersion`   | compiler 使用的 Unicode 数据版本                                                             |
| `textProfile.segmentation`     | 字符、词和边界切分算法版本，例如 `UAX29`                                                     |
| `textProfile.cldrVersion`      | locale、排序和语言处理使用的 CLDR 版本                                                       |
| `textProfile.locale`           | 默认排序和文本处理 locale                                                                    |
| `canonicalization`             | 固定为 `RFC8785+domain-array-order/1`，定义对象 key 与领域数组的确定性顺序                   |
| `contentHash`                  | 删除本字段后，对解压 JSON canonical bytes 计算的 SHA-256                                     |
| `counts`                       | 以 canonical JSON Pointer 为 key 的实体数组计数；必须覆盖全部 108 个实体集合并与实际长度一致 |

`counts` 的 key 是 schema 生成的 canonical JSON Pointer。真实构建必须覆盖 schema 中每个 entity array 并填写准确 count；上面只截取部分 key，零值不是验收值。validator 不能接受缺失的 count key。

预算上限、token 单价、并发度、provider request ID、物理文件 SHA-256、构建时间和 BuildRun ID 属于受保护 BuildRun/evidence，而不是词典内容。它们不进入 `manifest.contentHash`；prompt/schema/model policy、请求与实际模型身份会进入 manifest 和 candidate cache key。这样同一可复现输入仍生成相同内容，同时运维证据可以解释一次构建花费了多少以及怎样执行。

## 4. Normalized graph 而非逐词大嵌套

一个 Concept、ExampleSentence 或 Exercise 可被多个实体引用。如果把每个单词做成完全嵌套对象，会复制内容并产生不同步版本。因此 artifact 使用 flat entity arrays + ID reference：

`lexicon` 的 required collection 分为：

- identity/revision：Headword、Entry、Sense、Concept；
- form/content/relation：Form、representation、media、definition、translation、usage、lineage、relation、example、collocation；
- SynSem：Frame、syntactic/semantic argument、predicate、mapping；
- `morphology`：morph、morpheme、analysis、segment、inflection、word formation；
- `etymology`：etymon、revision、hypothesis、typed link；
- `corpora`：dataset/version、typed frequency observation、attestation、collocation observation；
- typed external identifier。

所有 collection 的准确名称、item 字段和 discriminator 由 JSON Schema 的 `$defs` 固定。Typed target 统一使用 `{ targetKind, targetId }`；Importer 按 `targetKind` 拆到强外键表，不能从 ID 前缀猜类型。

数组顺序属于 contract：所有数组按文档化 stable business key 排序；消费者不得依赖数据库 UUID 的随机顺序。

Artifact 只包含一个 release，但仍把稳定 identity 与 release revision 分开。manifest 是 release 元数据的唯一位置；每个当前可服务的 Headword/Entry/Sense/Concept identity 恰好对应一个 revision。只为 split/merge 保留的旧 stable ID 使用 `artifactRole=LINEAGE_ANCHOR`，可以没有当前 revision，但必须被 lineage 引用。完整投影见 [Artifact 与数据库映射](./artifact-database-mapping.md)。

### 4.1 公共字段约定

| 字段/类型                       | 统一含义                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `id`                            | Artifact 内稳定、唯一、可被引用的字符串 ID；consumer 不能从 ID 前缀推断实体类型  |
| `*Id`                           | 指向同一 Artifact 中另一行的外键；完整 validator 必须验证目标存在且类型正确      |
| `identityKey`                   | 跨 release 稳定的领域身份键；不承载显示文本                                      |
| `artifactRole`                  | `CURRENT` 表示当前可服务实体；`LINEAGE_ANCHOR` 只为 split/merge 历史保留         |
| `*Revision` / `*RevisionId`     | 某个 release 下不可变的显示或学习内容版本；稳定 identity 与 revision 不得合并    |
| `provenanceId`                  | 指向 `provenance.bundles.id`，说明该正式事实怎样由证据和规则决定                 |
| `contentHash` / `checksum`      | 前者标识 canonical 内容，后者固定外部输入字节；均使用 `sha256:<64 hex>`          |
| `languageTag`                   | BCP 47 语言标签；`regionTag`、`scriptTag` 进一步标记地区或书写系统               |
| `displayOrder` / `position`     | 从 1 开始的稳定领域顺序；不是数据库插入顺序，也不能用随机 UUID 排序              |
| `target: {targetKind,targetId}` | 显式 typed reference；`targetKind` 决定 `targetId` 必须指向哪一种集合            |
| nullable scalar                 | 字段仍然 required，但没有值时显式写 `null`；Schema 不用“缺字段”表达未知          |
| `*TermId`                       | 指向 `vocabularies.terms.id`，避免把 POS、语法角色或关系类型散落为未版本化字符串 |
| `normalizedText` / `searchKey`  | 前者用于确定性比较，后者用于检索；都不能替代面向用户的 `displayText` 或 `text`   |

所有记录定义都设置 `additionalProperties: false`，且定义中的 property 全部 required。联合类型用 `targetKind`、`blockKind`、`responseKind` 或 `ruleKind` 选择具体 shape；不得把联合类型扩展为任意 payload JSON。

## 5. 连通核心对象示例

本节与后面的教学材料和题目示例共用 `helpful` ID，合起来展示一条从词头到学习内容的可连接数据链。示例是相关数组的合法片段，不是缺少其他 required collection 的完整 Artifact 根对象。

```json
{
  "headwords": [
    {
      "id": "hw_helpful",
      "identityKey": "en:helpful",
      "artifactRole": "CURRENT"
    }
  ],
  "headwordRevisions": [
    {
      "headwordId": "hw_helpful",
      "displayText": "helpful",
      "normalizedText": "helpful",
      "searchKey": "helpful",
      "sortKey": "base64:..."
    }
  ],
  "entries": [
    {
      "id": "entry_helpful_adj_1",
      "identityKey": "en:helpful:entry:adj:1",
      "artifactRole": "CURRENT"
    }
  ],
  "entryRevisions": [
    {
      "entryId": "entry_helpful_adj_1",
      "headwordId": "hw_helpful",
      "entryType": "WORD",
      "partOfSpeech": "lexinfo:adjective",
      "homographNo": 1,
      "displayOrder": 1,
      "provenanceId": "prov_helpful_entry"
    }
  ],
  "forms": [
    {
      "id": "form_helpful_canonical",
      "entryId": "entry_helpful_adj_1",
      "formType": "CANONICAL",
      "displayOrder": 1,
      "provenanceId": "prov_helpful_form"
    }
  ],
  "formRepresentations": [
    {
      "id": "rep_helpful_written",
      "formId": "form_helpful_canonical",
      "representationType": "WRITTEN",
      "languageTag": "en",
      "regionTag": null,
      "scriptTag": "Latn",
      "text": "helpful",
      "normalizedText": "helpful",
      "provenanceId": "prov_helpful_form"
    }
  ],
  "senses": [
    {
      "id": "sense_helpful_providing_help",
      "identityKey": "en:helpful:adj:providing-help",
      "artifactRole": "CURRENT"
    },
    {
      "id": "sense_helpful_willing_to_help",
      "identityKey": "en:helpful:adj:willing-to-help",
      "artifactRole": "CURRENT"
    }
  ],
  "senseRevisions": [
    {
      "senseId": "sense_helpful_providing_help",
      "entryId": "entry_helpful_adj_1",
      "parentSenseId": null,
      "displayOrder": 1,
      "provenanceId": "prov_helpful_sense"
    },
    {
      "senseId": "sense_helpful_willing_to_help",
      "entryId": "entry_helpful_adj_1",
      "parentSenseId": null,
      "displayOrder": 2,
      "provenanceId": "prov_helpful_sense"
    }
  ],
  "definitions": [
    {
      "id": "def_helpful_en_1",
      "senseId": "sense_helpful_providing_help",
      "languageTag": "en",
      "definitionType": "LEARNER",
      "text": "giving help or making a situation easier",
      "displayOrder": 1,
      "provenanceId": "prov_helpful_definition"
    },
    {
      "id": "def_helpful_en_2",
      "senseId": "sense_helpful_willing_to_help",
      "languageTag": "en",
      "definitionType": "LEARNER",
      "text": "willing to help other people",
      "displayOrder": 1,
      "provenanceId": "prov_helpful_definition"
    }
  ],
  "translationTexts": [
    {
      "id": "translation_helpful_zh_1",
      "senseId": "sense_helpful_providing_help",
      "languageTag": "zh-CN",
      "text": "有帮助的；有益的",
      "registerTermId": null,
      "displayOrder": 1,
      "provenanceId": "prov_helpful_translation"
    }
  ],
  "senseRelations": [
    {
      "id": "relation_helpful_related_senses",
      "sourceId": "sense_helpful_providing_help",
      "targetId": "sense_helpful_willing_to_help",
      "relationType": "lexinfo:relatedTerm",
      "direction": "SYMMETRIC",
      "provenanceId": "prov_helpful_relation"
    }
  ],
  "examples": [
    {
      "id": "example_helpful_advice",
      "languageTag": "en",
      "text": "She gave me some helpful advice.",
      "normalizedText": "She gave me some helpful advice.",
      "provenanceId": "prov_helpful_example"
    }
  ],
  "exampleTranslations": [
    {
      "id": "example_translation_helpful_advice_zh",
      "exampleId": "example_helpful_advice",
      "languageTag": "zh-CN",
      "text": "她给了我一些有用的建议。",
      "provenanceId": "prov_helpful_example"
    }
  ],
  "senseExamples": [
    {
      "id": "sense_example_helpful_advice",
      "senseId": "sense_helpful_providing_help",
      "exampleId": "example_helpful_advice",
      "displayOrder": 1,
      "role": "ILLUSTRATIVE",
      "provenanceId": "prov_helpful_example"
    }
  ],
  "collocations": [
    {
      "id": "collocation_helpful_advice",
      "languageTag": "en",
      "canonicalText": "helpful advice",
      "normalizedText": "helpful advice",
      "headEntryId": "entry_helpful_adj_1",
      "provenanceId": "prov_helpful_collocation"
    }
  ],
  "senseCollocations": [
    {
      "senseId": "sense_helpful_providing_help",
      "collocationId": "collocation_helpful_advice",
      "relationType": "TYPICAL",
      "displayOrder": 1,
      "provenanceId": "prov_helpful_collocation"
    }
  ],
  "collocationComponents": [
    {
      "collocationId": "collocation_helpful_advice",
      "position": 1,
      "surfaceText": "helpful",
      "roleTermId": "term_collocation_head",
      "target": {
        "targetKind": "ENTRY",
        "targetId": "entry_helpful_adj_1"
      }
    },
    {
      "collocationId": "collocation_helpful_advice",
      "position": 2,
      "surfaceText": "advice",
      "roleTermId": "term_collocation_partner",
      "target": null
    }
  ]
}
```

每一层有独立 ID 和 provenance。`definitions`、`translationTexts`、examples、relations 和 collocations 都通过 ID 绑定具体 Sense，不默认挂到第一个义项。`advice` 在这个片段中是自由文本 component，因此 `target=null`；如果它也作为 Entry 收录，则应改为显式 ENTRY target。

## 6. 形态结果

```json
{
  "forms": [
    {
      "id": "form_break_past_participle",
      "entryId": "entry_break_verb_1",
      "formType": "INFLECTED",
      "displayOrder": 4,
      "provenanceId": "prov_wikt_broken_form"
    }
  ],
  "formRepresentations": [
    {
      "id": "rep_broken_inflected",
      "formId": "form_break_past_participle",
      "representationType": "WRITTEN",
      "languageTag": "en",
      "regionTag": null,
      "scriptTag": "Latn",
      "text": "broken",
      "normalizedText": "broken",
      "provenanceId": "prov_wikt_broken_form"
    }
  ],
  "formFeatures": [
    {
      "formId": "form_break_past_participle",
      "feature": "ud:VerbForm",
      "value": "ud:Part"
    },
    {
      "formId": "form_break_past_participle",
      "feature": "ud:Tense",
      "value": "ud:Past"
    }
  ]
}
```

如果 `broken` 还有独立形容词 Entry，则 artifact 同时包含 `entry_broken_adjective_1`；不会为了去重删除真实独立 Entry。

同一份连通样例中的 `helpful` 可以继续通过 `formRepresentationId` 接入构词切分：

```json
{
  "morphs": [
    {
      "id": "morph_help",
      "identityKey": "en:morph:help",
      "artifactRole": "CURRENT"
    },
    {
      "id": "morph_ful",
      "identityKey": "en:morph:ful",
      "artifactRole": "CURRENT"
    }
  ],
  "morphemes": [
    {
      "id": "morpheme_help",
      "identityKey": "en:morpheme:help",
      "artifactRole": "CURRENT"
    },
    {
      "id": "morpheme_ful",
      "identityKey": "en:morpheme:ful",
      "artifactRole": "CURRENT"
    }
  ],
  "analyses": [
    {
      "id": "analysis_helpful_help_ful",
      "formRepresentationId": "rep_helpful_written",
      "analysisType": "DERIVATIONAL",
      "provenanceId": "prov_helpful_morphology"
    }
  ],
  "segments": [
    {
      "analysisId": "analysis_helpful_help_ful",
      "position": 1,
      "startOffset": 0,
      "endOffset": 4,
      "surfaceText": "help",
      "morphId": "morph_help",
      "morphemeId": "morpheme_help",
      "roleTermId": "term_morphological_root"
    },
    {
      "analysisId": "analysis_helpful_help_ful",
      "position": 2,
      "startOffset": 4,
      "endOffset": 7,
      "surfaceText": "ful",
      "morphId": "morph_ful",
      "morphemeId": "morpheme_ful",
      "roleTermId": "term_morphological_suffix"
    }
  ]
}
```

offset 使用 manifest 固定的 Unicode/segmentation profile；不能按 JavaScript UTF-16 下标、数据库字符函数或模型返回值各自解释。

## 7. Learning content

`learning` 必须包含 books、book editions、typed book items、source-backed proficiency claims、Objective/revision/subject/hint、PedagogicalMaterial/revision/target/block/mention/citation、Stimulus/revision/block、Exercise/revision/response-config/choice/correct-response/feedback/rubric，以及 AssessmentBlueprint/revision/section/selection rule。所有 typed relation 都使用显式 discriminator，不使用平行数组位置或无外键 polymorphic ID。

用户 `DailyStudyPlan`、`UserObjectiveMemoryState`、`ExerciseAttempt`、`ReviewEvent`、`AssessmentSession` 和 `AssessmentResult` 永远不进入 artifact。

## 8. 教学材料示例

教学材料是 release-scoped、可独立消费的结构化对象。它不能替代 SenseDefinition、EtymologyHypothesis 或 WordFormation 等正式事实，也不能保存 DictionaryByGPT4 风格的整篇 Markdown 字符串：

```json
{
  "pedagogicalMaterials": [
    {
      "id": "material_helpful_micro_story",
      "materialKey": "helpful.providing-help.micro-story.zh.v1"
    }
  ],
  "pedagogicalMaterialRevisions": [
    {
      "id": "material_revision_helpful_micro_story_v1",
      "materialId": "material_helpful_micro_story",
      "materialKind": "MICRO_STORY",
      "learningLanguageTag": "en",
      "supportLanguageTag": "zh-CN",
      "audienceProfileKey": "zh-general-adult-en-v1",
      "contentHash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      "provenanceId": "prov_material_helpful_story"
    }
  ],
  "pedagogicalMaterialTargets": [
    {
      "materialRevisionId": "material_revision_helpful_micro_story_v1",
      "targetRole": "PRIMARY",
      "target": {
        "targetKind": "SENSE",
        "targetId": "sense_helpful_providing_help"
      }
    }
  ],
  "pedagogicalMaterialBlocks": [
    {
      "id": "material_block_helpful_story_en",
      "materialRevisionId": "material_revision_helpful_micro_story_v1",
      "blockKind": "TEXT",
      "blockRole": "STORY",
      "position": 1,
      "languageTag": "en",
      "text": "Helpful neighbors carried the boxes upstairs together."
    },
    {
      "id": "material_block_helpful_story_zh",
      "materialRevisionId": "material_revision_helpful_micro_story_v1",
      "blockKind": "TEXT",
      "blockRole": "TRANSLATION",
      "position": 2,
      "languageTag": "zh-CN",
      "text": "热心的邻居们一起把箱子搬上了楼。"
    }
  ],
  "pedagogicalMaterialMentions": [
    {
      "id": "material_mention_helpful_story_1",
      "materialBlockId": "material_block_helpful_story_en",
      "startOffset": 0,
      "endOffset": 7,
      "target": {
        "targetKind": "FORM",
        "targetId": "form_helpful_canonical"
      }
    }
  ],
  "pedagogicalMaterialCitations": []
}
```

`CULTURAL_CONTEXT` 的事实 block 必须出现在 `pedagogicalMaterialCitations` 中并引用 source-backed `provenance.evidence`；`MNEMONIC` 和 `MICRO_STORY` 可以只使用 GENERATED evidence，但不能声称虚构内容是真实词源。双语原文与译文是独立 block，消费者不能依赖换行或 Markdown heading 拆字段。

## 9. 题目示例

```json
{
  "learningObjectives": [
    {
      "id": "objective_helpful_receptive",
      "objectiveKey": "helpful.meaning.providing-help.receptive.zh"
    }
  ],
  "objectiveRevisions": [
    {
      "id": "objective_revision_helpful_receptive_v1",
      "objectiveId": "objective_helpful_receptive",
      "knowledgeFacet": "MEANING_FORM_MEANING",
      "retrievalDirection": "RECEPTIVE",
      "contentHash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      "provenanceId": "prov_objective_helpful"
    }
  ],
  "objectiveSubjects": [
    {
      "learningObjectiveRevisionId": "objective_revision_helpful_receptive_v1",
      "subjectRole": "PRIMARY",
      "target": {
        "targetKind": "SENSE",
        "targetId": "sense_helpful_providing_help"
      }
    }
  ],
  "exerciseItems": [
    {
      "id": "exercise_helpful_receptive_choice",
      "exerciseKey": "helpful.receptive.choice.zh.v1",
      "learningObjectiveId": "objective_helpful_receptive"
    }
  ],
  "exerciseRevisions": [
    {
      "id": "exercise_revision_helpful_receptive_choice_v1",
      "exerciseItemId": "exercise_helpful_receptive_choice",
      "learningObjectiveRevisionId": "objective_revision_helpful_receptive_v1",
      "exerciseTaskKind": "FORM_MEANING_MAPPING",
      "evidenceKind": "RECOGNITION",
      "responseKind": "CHOICE",
      "responseCardinality": "SINGLE",
      "responsePlacement": "BLOCK",
      "gradingMode": "EXACT",
      "validationLevel": "SUMMATIVE_VERIFIED",
      "prompt": {
        "languageTag": "en",
        "text": "Which meaning matches helpful?"
      },
      "instructions": null,
      "shuffleChoices": true,
      "maxScore": 1,
      "authoredDifficultyTier": "FOUNDATION",
      "templateVersion": "receptive-choice/1",
      "generatorVersion": "template+provider-model-snapshot/1",
      "verifierVersion": "exercise-verifier/1",
      "contentHash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      "provenanceId": "prov_exercise_helpful"
    }
  ],
  "exerciseResponseConfigs": [
    {
      "exerciseRevisionId": "exercise_revision_helpful_receptive_choice_v1",
      "responseKind": "CHOICE",
      "minSelections": 1,
      "maxSelections": 1
    }
  ],
  "exerciseChoices": [
    {
      "id": "choice_helpful_correct",
      "exerciseRevisionId": "exercise_revision_helpful_receptive_choice_v1",
      "choiceKey": "correct",
      "languageTag": "zh-CN",
      "text": "有帮助的；有益的",
      "displayOrder": 1,
      "distractorKind": null
    },
    {
      "id": "choice_helpful_wrong_1",
      "exerciseRevisionId": "exercise_revision_helpful_receptive_choice_v1",
      "choiceKey": "wrong-sense-1",
      "languageTag": "zh-CN",
      "text": "无助的；没有用的",
      "displayOrder": 2,
      "distractorKind": "ANTONYM_CONFUSION"
    },
    {
      "id": "choice_helpful_wrong_2",
      "exerciseRevisionId": "exercise_revision_helpful_receptive_choice_v1",
      "choiceKey": "wrong-sense-2",
      "languageTag": "zh-CN",
      "text": "小心的；谨慎的",
      "displayOrder": 3,
      "distractorKind": "SEMANTIC_NEIGHBOR"
    },
    {
      "id": "choice_helpful_wrong_3",
      "exerciseRevisionId": "exercise_revision_helpful_receptive_choice_v1",
      "choiceKey": "wrong-sense-3",
      "languageTag": "zh-CN",
      "text": "充满希望的",
      "displayOrder": 4,
      "distractorKind": "ORTHOGRAPHIC_NEIGHBOR"
    }
  ],
  "correctResponses": [
    {
      "responseKind": "CHOICE",
      "exerciseRevisionId": "exercise_revision_helpful_receptive_choice_v1",
      "choiceId": "choice_helpful_correct",
      "weight": 1
    }
  ],
  "exerciseFeedback": [
    {
      "id": "feedback_helpful_correct_zh",
      "exerciseRevisionId": "exercise_revision_helpful_receptive_choice_v1",
      "outcome": "CORRECT",
      "choiceId": null,
      "languageTag": "zh-CN",
      "text": "helpful 在这里表示有帮助的或有益的。",
      "displayOrder": 1
    }
  ]
}
```

正确答案引用 `choiceId`，不使用 `correctIndex`。运行时选项洗牌只改变 `ExerciseAttemptPresentedChoice.presentationOrder`。Objective 中没有 cue/answer；所有可呈现内容均由 ExerciseRevision、typed response config 和 Stimulus 提供。

同一 schema 对以下组合使用完全相同的 `ExerciseRevision` 契约。这个摘要用于展示组合，不是额外 artifact section，也不是完整 ExerciseRevision：

```text
[
  {
    "exerciseTaskKind": "FORM_MEANING_MAPPING",
    "evidenceKind": "RECOGNITION",
    "responseKind": "CHOICE",
    "responseCardinality": "SINGLE",
    "responsePlacement": "BLOCK",
    "gradingMode": "EXACT",
    "validationLevel": "SUMMATIVE_VERIFIED"
  },
  {
    "exerciseTaskKind": "FORM_MEANING_MAPPING",
    "evidenceKind": "CUED_RECALL",
    "responseKind": "SHORT_TEXT",
    "responseCardinality": "SINGLE",
    "responsePlacement": "BLOCK",
    "gradingMode": "EXACT",
    "validationLevel": "FORMATIVE_VERIFIED"
  },
  {
    "exerciseTaskKind": "CONTEXTUAL_SENSE_INTERPRETATION",
    "evidenceKind": "CONTEXTUAL_DISCRIMINATION",
    "responseKind": "CHOICE",
    "responseCardinality": "SINGLE",
    "responsePlacement": "BLOCK",
    "gradingMode": "EXACT",
    "validationLevel": "SUMMATIVE_VERIFIED"
  },
  {
    "exerciseTaskKind": "SPOKEN_FORM_PRODUCTION",
    "evidenceKind": "CUED_RECALL",
    "responseKind": "NO_CAPTURE",
    "responseCardinality": "SINGLE",
    "responsePlacement": "BLOCK",
    "gradingMode": "SELF_REPORT",
    "validationLevel": "PRACTICE_ONLY"
  },
  {
    "exerciseTaskKind": "COLLOCATION_RECALL",
    "evidenceKind": "CONSTRAINED_PRODUCTION",
    "responseKind": "SHORT_TEXT",
    "responseCardinality": "SINGLE",
    "responsePlacement": "INLINE",
    "gradingMode": "EXACT",
    "validationLevel": "SUMMATIVE_VERIFIED"
  },
  {
    "exerciseTaskKind": "SENTENCE_PRODUCTION",
    "evidenceKind": "FREE_PRODUCTION",
    "responseKind": "EXTENDED_TEXT",
    "responseCardinality": "SINGLE",
    "responsePlacement": "BLOCK",
    "gradingMode": "SELF_REPORT",
    "validationLevel": "PRACTICE_ONLY"
  }
]
```

共享 passage/词典例句通过 `assessmentStimuli -> stimulusRevisions -> stimulusBlocks` 定义，再由 `exerciseStimulusRefs` 引用。`stimulusBlocks.blockKind=MATERIAL` 引用 immutable PedagogicalMaterialRevision，因此微故事可以复用而不复制正文。简单题允许这些数组为空；需要上下文才能唯一作答的题不能只把语境拼进不可追踪的 prompt。

## 10. 完整字段字典

以下表格与 Schema v1 对齐。表中列出的字段全部 required；“可空”表示字段必须存在但值可以是 `null`。字段类型、长度、URI/date-time 格式和数值边界仍以机器 Schema 为准。

### 10.1 受控词表、来源与证据

| JSON path                        | 字段及含义                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vocabularies.bundles`           | `id`：词表 bundle ID；`version`：bundle 版本；`contentHash`：所有 namespace/term 的内容哈希                                                                                                             |
| `vocabularies.namespaceVersions` | `id`：namespace 版本 ID；`bundleId`：所属 bundle；`namespaceUri`：术语命名空间；`version`：版本；`sourceUri`：规范来源；`checksum`：来源字节哈希                                                        |
| `vocabularies.terms`             | `id`：可被 `*TermId` 引用的 ID；`namespaceVersionId`：所属 namespace；`code/uri/label`：代码、全局 URI、显示名；`deprecated`：是否弃用；`replacedById`：替代 term，可空                                 |
| `sources.datasets`               | `id/key/name`：数据集 ID、稳定键和名称；`homepageUri`：项目主页                                                                                                                                         |
| `sources.datasetVersions`        | `id`：版本 ID；`datasetId`：所属数据集；`version/sourceUri/checksum`：版本、下载位置和字节哈希；`retrievedAt`：获取时间；`rightsPolicyId`：适用权利策略                                                 |
| `sources.records`                | `id`：源记录 ID；`datasetVersionId/sourceKey`：所属版本和源内键；`languageTag`：记录语言；`rawPayloadHash`：原始内容哈希；`rawPayloadUri`：受控原文位置，可空；`rawPayload`：允许公开的 JSON 原文，可空 |
| `sources.rightsPolicies`         | `id/key/version`：策略身份；`mayBuild/mayServe/mayExport`：是否允许构建、在线服务、公开导出；`requiresAttribution/attribution`：署名要求与文本；`effectiveFrom/effectiveTo`：生效区间，结束时间可空     |
| `sources.restrictions`           | `id`：限制事件 ID；`rightsPolicyId/datasetVersionId`：受影响策略和数据版本；`restrictionKind/reason`：限制类型和原因；`effectiveAt`：生效时间                                                           |
| `provenance.bundles`             | `id`：正式内容引用的 provenance ID；`contentHash`：决策内容哈希；`resolverVersion`：合并/裁决算法版本；`decisionReason`：选用或合并这些证据的机器可读原因                                               |
| `provenance.evidence`            | `id`：证据 ID；`provenanceId`：所属 bundle；`evidenceKind`：`DIRECT/DERIVED/SUPPORTING/CONTRADICTING/GENERATED`；`sourceRecordId` 与 `upstreamProvenanceId`：二选一；`note`：补充说明，可空             |

`ContentEvidence` 必须恰好指向一个原始 `SourceRecord` 或一个上游 `ContentProvenance`。AI 生成内容使用 `GENERATED`，但仍必须固定模型响应来源与上游证据，不能用空 provenance 表示“AI 猜的”。

### 10.2 词典身份、词形与义项

| JSON path                         | 字段及含义                                                                                                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lexicon.headwords`               | `id/identityKey/artifactRole`：词头稳定身份；Headword 只负责检索入口，不承载词性或义项                                                                                                                      |
| `lexicon.headwordRevisions`       | `headwordId`：稳定词头；`displayText`：展示文本；`normalizedText`：规范化文本；`searchKey`：检索键；`sortKey`：固定排序字节                                                                                 |
| `lexicon.entries`                 | `id/identityKey/artifactRole`：词条稳定身份；不同词性、同形异源词或 multiword 是不同 Entry                                                                                                                  |
| `lexicon.entryRevisions`          | `entryId/headwordId`：词条与所属词头；`entryType`：`WORD/MULTIWORD/AFFIX`；`partOfSpeech`：受控 POS code；`homographNo`：同形词序号，可空；`displayOrder`：词头内顺序；`provenanceId`：来源决策             |
| `lexicon.forms`                   | `id/entryId`：词形及所属 Entry；`formType`：`CANONICAL/INFLECTED/VARIANT/ABBREVIATED`；`displayOrder`：Entry 内顺序；`provenanceId`：来源                                                                   |
| `lexicon.formRepresentations`     | `id/formId`：某词形的一种表示；`representationType`：`WRITTEN/PHONETIC/ROMANIZED`；`languageTag/regionTag/scriptTag`：语言、地区、文字；`text/normalizedText`：原文和规范化值；`provenanceId`：来源         |
| `lexicon.formFeatures`            | `formId`：词形；`feature/value`：受控形态特征和值，例如 `ud:Tense=ud:Past`                                                                                                                                  |
| `lexicon.mediaAssets`             | `id`：媒体 ID；`mediaType`：`AUDIO/IMAGE`；`mimeType/contentUri/contentHash/byteLength/durationMs`：格式、地址、哈希、大小、时长；`rightsPolicyId/provenanceId`：权利与来源；时长可空                       |
| `lexicon.formMedia`               | `formId/mediaAssetId`：词形与媒体；`role`：媒体用途；`regionTag`：口音/地区，可空；`displayOrder`：展示顺序                                                                                                 |
| `lexicon.senses`                  | `id/identityKey/artifactRole`：义项稳定身份；近义词、反义词和例句必须绑定具体 Sense                                                                                                                         |
| `lexicon.senseRevisions`          | `senseId/entryId`：义项与所属 Entry；`parentSenseId`：父义项，可空；`displayOrder`：Entry 内顺序；`provenanceId`：义项划分证据                                                                              |
| `lexicon.definitions`             | `id/senseId`：定义及所属义项；`languageTag`：定义语言；`definitionType`：定义用途；`text`：定义正文；`displayOrder`：顺序；`provenanceId`：来源                                                             |
| `lexicon.translationTexts`        | `id/senseId`：翻译及所属义项；`languageTag/text`：目标语言和译文；`registerTermId`：语域，可空；`displayOrder/provenanceId`：顺序和来源                                                                     |
| `lexicon.translationRelations`    | `id/sourceSenseId/targetSenseId`：两个语言中 Sense 的翻译连接；`translationType`：翻译关系类型；`provenanceId`：证据                                                                                        |
| `lexicon.usages`                  | `id/senseId`：用法限制及所属义项；`usageTypeTermId`：register/domain/region/temporal 等类型；`valueTermId`：受控值，可空；`text`：自由说明，可空；二者至少一个存在；`displayOrder/provenanceId`：顺序和来源 |
| `lexicon.concepts`                | `id/identityKey/artifactRole`：可跨语言共享的 LexicalConcept 稳定身份                                                                                                                                       |
| `lexicon.conceptRevisions`        | `conceptId`：稳定概念；`conceptType`：概念类型；`provenanceId`：来源                                                                                                                                        |
| `lexicon.conceptDefinitions`      | `id/conceptId/languageTag/text`：概念的多语言定义；`displayOrder/provenanceId`：顺序和来源                                                                                                                  |
| `lexicon.senseConceptMemberships` | `senseId/conceptId`：Sense 到 Concept 的成员关系；`membershipType`：映射类型；`canonical`：是否规范代表；`provenanceId`：来源                                                                               |

### 10.3 关系、例句、搭配与 SynSem

| JSON path                       | 字段及含义                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lexicon.entryLineages`         | `id/fromId/toId`：Entry 版本身份迁移；`lineageType`：`SPLIT_FROM/MERGED_FROM/REPLACES`；`provenanceId`：迁移依据                                              |
| `lexicon.senseLineages`         | `id/fromId/toId`：Sense 级身份迁移端点；`lineageType`：`SPLIT_FROM/MERGED_FROM/REPLACES`；`provenanceId`：迁移依据                                            |
| `lexicon.conceptLineages`       | `id/fromId/toId`：Concept 级身份迁移端点；`lineageType`：`SPLIT_FROM/MERGED_FROM/REPLACES`；`provenanceId`：迁移依据                                          |
| `lexicon.entryRelations`        | `id/sourceId/targetId`：Entry 级关系端点；`relationType`：例如派生或变体关系；`direction`：`DIRECTED/SYMMETRIC`；`provenanceId`：来源                         |
| `lexicon.senseRelations`        | `id/sourceId/targetId`：Sense 级端点；`relationType`：synonym、antonym 等关系；`direction`：`DIRECTED/SYMMETRIC`；`provenanceId`：来源                        |
| `lexicon.conceptRelations`      | `id/sourceId/targetId`：Concept 级端点；`relationType`：hypernym、hyponym 等关系；`direction`：`DIRECTED/SYMMETRIC`；`provenanceId`：来源                     |
| `lexicon.examples`              | `id/languageTag/text/normalizedText`：可复用例句；`provenanceId`：来源                                                                                        |
| `lexicon.exampleTranslations`   | `id/exampleId/languageTag/text`：例句译文；`provenanceId`：来源                                                                                               |
| `lexicon.senseExamples`         | `id/senseId/exampleId`：义项与例句的显式连接；`displayOrder`：义项内顺序；`role`：示例用途；`provenanceId`：连接依据                                          |
| `lexicon.citations`             | `id/exampleId/sourceRecordId`：例句与原始记录；`workTitle/location/year/examType`：作品、位置、年份、考试类型，均可空；`verified`：是否人工或规则核验         |
| `lexicon.collocations`          | `id/languageTag/canonicalText/normalizedText`：搭配身份与文本；`headEntryId`：中心 Entry，可空；`provenanceId`：来源                                          |
| `lexicon.senseCollocations`     | `senseId/collocationId`：义项与搭配；`relationType`：搭配角色；`displayOrder/provenanceId`：顺序和来源                                                        |
| `lexicon.collocationComponents` | `collocationId/position/surfaceText`：搭配中的片段；`roleTermId`：片段角色；`target`：`ENTRY/MORPHEME` typed target 或 `null`，用于区分词典实体和固定自由文本 |
| `lexicon.frames`                | `id/entryId/frameKey`：句法框架；`frameTypeTermId`：框架类型；`languageTag/displayTemplate`：语言和展示模板；`provenanceId`：来源                             |
| `lexicon.syntacticArguments`    | `id/frameId/position`：框架参数；`functionTermId/phraseTypeTermId`：句法功能和短语类型；`marker`：介词等标记，可空；`optional`：参数是否可省                  |
| `lexicon.predicates`            | `id/senseId/predicateKey`：语义谓词；`predicateTypeTermId`：谓词类型；`label`：显示名，可空；`provenanceId`：来源                                             |
| `lexicon.semanticArguments`     | `id/predicateId/roleTermId/position`：谓词的语义角色及顺序                                                                                                    |
| `lexicon.senseFrames`           | `id/senseId/frameId`：义项采用的句法框架；`predicateId`：对应语义谓词，可空；`provenanceId`：来源                                                             |
| `lexicon.argumentMappings`      | `senseFrameId/syntacticArgumentId/semanticArgumentId`：在某 SenseFrame 中把句法参数映射到语义角色                                                             |

### 10.4 形态、词源、语料与外部标识

| JSON path                                      | 字段及含义                                                                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lexicon.morphology.morphs`                    | `id/identityKey/artifactRole`：可观察字符串片段的稳定身份                                                                                                                                      |
| `lexicon.morphology.morphemes`                 | `id/identityKey/artifactRole`：抽象语素的稳定身份；同一 Morpheme 可有多个 Morph                                                                                                                |
| `lexicon.morphology.analyses`                  | `id/formRepresentationId`：被分析的具体词形表示；`analysisType`：分析类型；`provenanceId`：来源                                                                                                |
| `lexicon.morphology.segments`                  | `analysisId/position`：所属分析和片段顺序；`startOffset/endOffset/surfaceText`：基于 text profile 的区间和原文；`morphId/morphemeId`：表层片段与抽象语素；`roleTermId`：词根、前缀、后缀等角色 |
| `lexicon.morphology.inflectionRules`           | `id/ruleKey/version/ruleType`：屈折规则身份和版本；`inputPattern/outputPattern`：确定性输入输出模式；`provenanceId`：规则来源                                                                  |
| `lexicon.morphology.inflectionGenerations`     | `id/ruleId/entryId/baseFormId/outputFormId`：哪条规则把基础词形生成哪个屈折词形；`provenanceId`：生成证据                                                                                      |
| `lexicon.morphology.wordFormations`            | `id/targetEntryId`：构词结果 Entry；`formationTypeTermId`：派生、复合等类型；`provenanceId`：来源                                                                                              |
| `lexicon.morphology.wordFormationInputs`       | `wordFormationId/position/roleTermId`：构词输入顺序和角色；`target`：显式 `ENTRY/MORPHEME` target                                                                                              |
| `lexicon.morphology.wordFormationRules`        | `id/ruleKey/version/ruleType`：构词规则身份和版本；`inputPattern/outputPattern`：输入输出模式；`provenanceId`：规则来源                                                                        |
| `lexicon.morphology.wordFormationApplications` | `wordFormationId/ruleId/stepOrder`：多步构词过程中应用规则的顺序                                                                                                                               |
| `lexicon.etymology.etymons`                    | `id/identityKey/artifactRole`：词源历史形式的稳定身份                                                                                                                                          |
| `lexicon.etymology.etymonRevisions`            | `etymonId/languageTag/form/gloss`：历史语言、形式和释义；`provenanceId`：来源                                                                                                                  |
| `lexicon.etymology.hypotheses`                 | `id/subjectEntryId`：被解释的现代 Entry；`hypothesisType/status`：假说类型和可信状态；`provenanceId`：证据                                                                                     |
| `lexicon.etymology.links`                      | `id/hypothesisId/linkType`：假说中的有向边；`source/target`：`ENTRY/ETYMON` typed endpoints；`position`：链中顺序；`provenanceId`：来源                                                        |
| `lexicon.corpora.datasets`                     | `id/key/name/languageTag`：语料库稳定身份、名称和语言                                                                                                                                          |
| `lexicon.corpora.datasetVersions`              | `id/datasetId/version/checksum`：语料版本和字节哈希；`tokenCount`：该版本 token 总数；`provenanceId`：来源                                                                                     |
| `lexicon.corpora.frequencyObservations`        | `id/datasetVersionId/target`：对 `ENTRY/FORM/SENSE` 的观测；`count/normalizedFrequency/rank`：原始次数、标准频率、排名，至少一个非空；`unit/algorithmVersion/provenanceId`：单位、算法和来源   |
| `lexicon.corpora.attestations`                 | `id/datasetVersionId/target`：语料实例；`documentRef/offset/offsetUnit/surfaceText`：文档位置和表层文本；`sourceRecordId/provenanceId`：原始记录和来源                                         |
| `lexicon.corpora.collocationObservations`      | `id/datasetVersionId/collocationId`：搭配统计；`measureTermId/score/window/algorithmVersion`：统计指标、得分、窗口和算法；`provenanceId`：来源                                                 |
| `lexicon.externalIdentifiers`                  | `id/target`：`ENTRY/SENSE/CONCEPT` 对象；`namespaceVersionId/externalId/uri`：外部命名空间、标识和 URI；`provenanceId`：映射证据                                                               |

### 10.5 词书、能力等级与学习目标

| JSON path                               | 字段及含义                                                                                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `learning.books`                        | `id/key`：词书身份；`languageTag/title/publisherKey`：词书语言、标题和出版方稳定键                                                                                   |
| `learning.bookEditions`                 | `id/bookId/editionKey/version`：具体不可变版次；`sourceDatasetVersionId`：来源版本；`contentHash`：内容哈希；`publishedAt`：发布时间                                 |
| `learning.bookItems`                    | `id/editionId/rank`：版次中的条目和排名；`target`：`HEADWORD/ENTRY` typed target；`provenanceId`：来源                                                               |
| `learning.proficiencyFrameworks`        | `id/key/name`：CEFR 等能力框架身份；`sourceDatasetId`：规范来源                                                                                                      |
| `learning.proficiencyFrameworkVersions` | `id/frameworkId/version/namespace`：框架版本和 code namespace；`sourceDatasetVersionId`：固定来源版本                                                                |
| `learning.proficiencyLevels`            | `id/frameworkVersionId/code/label/rank`：某版本下的等级代码、显示名和从低到高顺序                                                                                    |
| `learning.proficiencyClaims`            | `id/target/levelId`：对 `HEADWORD/ENTRY/SENSE` 的等级声明；`claimType` 固定为 `SOURCE_ASSERTED`；`provenanceId`：原始声明证据                                        |
| `learning.learningObjectives`           | `id/objectiveKey`：学习目标稳定身份；不直接保存 Headword、cue 或 answer                                                                                              |
| `learning.objectiveRevisions`           | `id/objectiveId`：目标版本；`knowledgeFacet`：测量的词汇知识维度；`retrievalDirection`：`RECEPTIVE/PRODUCTIVE/BIDIRECTIONAL`；`contentHash/provenanceId`：内容和来源 |
| `learning.objectiveSubjects`            | `learningObjectiveRevisionId`：目标版本；`subjectRole`：`PRIMARY/SUPPORTING`；`target`：`SENSE/FORM/COLLOCATION/FRAME/SENSE_EXAMPLE` typed target                    |
| `learning.objectiveHints`               | `id/learningObjectiveRevisionId`：提示及目标；`hintType/languageTag/text`：类型、语言和正文；`displayOrder/provenanceId`：顺序和来源                                 |

Objective 表示“用户需要掌握什么”，不是一道题。一个 ObjectiveRevision 必须通过 `objectiveSubjects` 有且只有一个 PRIMARY subject；题目通过 `ExerciseItem.learningObjectiveId` 测量它。

### 10.6 教学材料、刺激材料与题目

| JSON path                               | 字段及含义                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `learning.pedagogicalMaterials`         | `id/materialKey`：教学材料稳定身份                                                                                                                                                                                                                                                                                                                                                                              |
| `learning.pedagogicalMaterialRevisions` | `id/materialId`：材料版本；`materialKind`：五类教学材料之一；`learningLanguageTag/supportLanguageTag`：学习语言和辅助语言；`audienceProfileKey`：受众；`contentHash/provenanceId`：内容和来源                                                                                                                                                                                                                   |
| `learning.pedagogicalMaterialTargets`   | `materialRevisionId`：材料版本；`targetRole`：`PRIMARY/SUPPORTING`；`target`：Entry、Sense、Form、Morpheme、WordFormation、Collocation 或 LearningObjective                                                                                                                                                                                                                                                     |
| `learning.pedagogicalMaterialBlocks`    | 公共字段 `id/materialRevisionId/blockKind/blockRole/position`；`TEXT` 增加 `languageTag/text`，`EXAMPLE` 增加 `senseExampleId`，`MEDIA` 增加 `mediaAssetId`                                                                                                                                                                                                                                                     |
| `learning.pedagogicalMaterialMentions`  | `id/materialBlockId/startOffset/endOffset`：TEXT block 中的字符区间；`target`：被提及的 typed lexical target                                                                                                                                                                                                                                                                                                    |
| `learning.pedagogicalMaterialCitations` | `id/materialBlockId/contentEvidenceId`：把具体事实 block 绑定到来源证据                                                                                                                                                                                                                                                                                                                                         |
| `learning.assessmentStimuli`            | `id/stimulusKey`：可复用刺激材料稳定身份                                                                                                                                                                                                                                                                                                                                                                        |
| `learning.stimulusRevisions`            | `id/stimulusId/contentHash/provenanceId`：刺激材料的不可变版本、哈希和来源                                                                                                                                                                                                                                                                                                                                      |
| `learning.stimulusBlocks`               | 公共字段 `id/stimulusRevisionId/blockKind/position`；按 `TEXT` 增加 `languageTag/text`，`EXAMPLE` 增加 `senseExampleId`，`MEDIA` 增加 `mediaAssetId`，`MATERIAL` 增加 `pedagogicalMaterialRevisionId`                                                                                                                                                                                                           |
| `learning.exerciseStimulusRefs`         | `exerciseRevisionId/stimulusRevisionId`：题目与刺激版本；`role/displayOrder`：用途和显示顺序                                                                                                                                                                                                                                                                                                                    |
| `learning.exerciseItems`                | `id/exerciseKey`：题目稳定身份；`learningObjectiveId`：被测目标稳定身份                                                                                                                                                                                                                                                                                                                                         |
| `learning.exerciseRevisions`            | `id/exerciseItemId/learningObjectiveRevisionId`：题目、稳定项和目标版本；`exerciseTaskKind/evidenceKind`：任务和证据；`responseKind/responseCardinality/responsePlacement/gradingMode/validationLevel`：响应、评分和验证；`prompt/instructions/shuffleChoices/maxScore`：呈现与计分；`authoredDifficultyTier/templateVersion/generatorVersion/verifierVersion/contentHash/provenanceId`：难度、版本、哈希和来源 |
| `learning.exerciseResponseConfigs`      | `exerciseRevisionId/responseKind`：所属题目和 discriminator；CHOICE 使用 `minSelections/maxSelections`；SHORT_TEXT 使用 `caseSensitive/diacriticPolicy/whitespacePolicy/capturePolicy`；EXTENDED_TEXT 使用 `expectedLanguageTag/minCharacters/maxCharacters/minWords/maxWords`；NO_CAPTURE 不接收正文，只允许 reveal 后 self-report                                                                             |
| `learning.exerciseChoices`              | `id/exerciseRevisionId/choiceKey`：选项身份；`languageTag/text/displayOrder`：语言、正文、作者顺序；`distractorKind`：干扰项类型，可空                                                                                                                                                                                                                                                                          |
| `learning.exerciseChoiceTargets`        | `choiceId/target`：可选地把选项语义绑定到一个 typed lexical target；纯文本选项不需要此行                                                                                                                                                                                                                                                                                                                        |
| `learning.correctResponses`             | discriminator `responseKind`；CHOICE 使用 `exerciseRevisionId/choiceId/weight`，ACCEPTED_TEXT 使用 `exerciseRevisionId/languageTag/text/weight`，RUBRIC 使用 `exerciseRevisionId/rubricCriterionId/weight`；NO_CAPTURE 不建立 correct response，结果来自运行时 self-report                                                                                                                                      |
| `learning.exerciseFeedback`             | `id/exerciseRevisionId/outcome`：反馈及 `CORRECT/INCORRECT/PARTIAL/ANY` 条件；`choiceId`：特定选项，可空；`languageTag/text/displayOrder`：反馈内容和顺序                                                                                                                                                                                                                                                       |
| `learning.exerciseRubrics`              | `id/exerciseRevisionId/criterionKey`：评分标准；`languageTag/description/maxScore/displayOrder`：语言、描述、最高分和顺序                                                                                                                                                                                                                                                                                       |
| `learning.assessmentBlueprints`         | `id/blueprintKey`：测评蓝图身份；`purpose`：`PRACTICE/BOOK_CHECKPOINT/DIAGNOSTIC/PLACEMENT`                                                                                                                                                                                                                                                                                                                     |
| `learning.assessmentBlueprintRevisions` | `id/blueprintId/version/title`：蓝图版本；`navigationMode/feedbackMode`：导航和反馈策略；`timeLimitSeconds`：总限时，可空；`lookbackDays`：曝光排除窗口；`contentHash/provenanceId`：内容和来源                                                                                                                                                                                                                 |
| `learning.assessmentSections`           | `id/blueprintRevisionId`：所属蓝图；`parentSectionId`：父 section，可空；`sectionKey/title/displayOrder/questionCount`：身份、显示和题数                                                                                                                                                                                                                                                                        |
| `learning.assessmentSelectionRules`     | 公共字段 `id/sectionId/ruleKind/position`；QUOTA 增加 `dimension/value/minCount/maxCount`，至少一个 count 非空；SCOPE 增加 `scopeKind/scopeId`；PINNED_ITEM 增加 `exerciseRevisionId`                                                                                                                                                                                                                           |

`ExerciseRevision` 的响应字段不能互相替代：

| 字段                     | 值与含义                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `exerciseTaskKind`       | 用户执行的认知任务，例如 form-meaning mapping、义项辨析、搭配回忆或造句；不是 UI 组件名                                         |
| `evidenceKind`           | 这次作答能提供什么学习证据，例如 recognition、cued recall、contextual discrimination 或 free production                         |
| `responseKind`           | `CHOICE/SHORT_TEXT/EXTENDED_TEXT/NO_CAPTURE`，决定响应数据形状；NO_CAPTURE 只保存 reveal 后 self-report                         |
| `responseCardinality`    | `SINGLE/MULTIPLE`；MULTIPLE 首期只允许 CHOICE                                                                                   |
| `responsePlacement`      | `BLOCK/INLINE`；INLINE 首期只允许 SHORT_TEXT                                                                                    |
| `gradingMode`            | `EXACT/WEIGHTED/SELF_REPORT/AI_ASSISTED`；后两类只允许练习                                                                      |
| `validationLevel`        | `PRACTICE_ONLY/FORMATIVE_VERIFIED/SUMMATIVE_VERIFIED`；EXTENDED_TEXT、NO_CAPTURE、SELF_REPORT、AI_ASSISTED 强制 `PRACTICE_ONLY` |
| `prompt`                 | `{languageTag,text}`；用户实际看到的问题                                                                                        |
| `instructions`           | 补充作答说明，可空；不能隐藏正确答案或关键语境                                                                                  |
| `shuffleChoices`         | 是否允许运行时打乱选项；正确答案仍按 `choiceId` 引用                                                                            |
| `maxScore`               | 该题最高分，必须大于 0                                                                                                          |
| `authoredDifficultyTier` | `FOUNDATION/DEVELOPING/ADVANCED`，作者/生成器给出的难度层级，不是用户能力估计                                                   |
| `templateVersion`        | 生成题目的模板版本                                                                                                              |
| `generatorVersion`       | 生成算法及模型快照版本                                                                                                          |
| `verifierVersion`        | 内容和歧义验证器版本                                                                                                            |

PedagogicalMaterial 的 `materialKind` 固定为 `LEARNER_EXPLANATION/MORPHOLOGY_WALKTHROUGH/CULTURAL_CONTEXT/MNEMONIC/MICRO_STORY`；block role 固定为 `HEADING/EXPLANATION/STORY/TRANSLATION/TAKEAWAY/EXAMPLE/MEDIA`。

### 10.7 Quality

| JSON path                          | 字段及含义                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `quality.profiles`                 | `id/key/targetKind`：内容完整度 profile 的稳定身份和适用目标类型                                                                                                   |
| `quality.profileVersions`          | `id/profileId/version/requirementsHash`：不可变规则版本及要求集合哈希                                                                                              |
| `quality.profileEvaluations`       | `id/profileVersionId/status`：一次 profile 结果；status 为 `PRESENT/MISSING/NOT_APPLICABLE/REJECTED`                                                               |
| `quality.profileEvaluationTargets` | `evaluationId/target`：结果对应的 Headword、Entry、Form、Sense、Concept、LearningObjective、PedagogicalMaterial、Exercise 或 BookEdition                           |
| `quality.coverage`                 | `id/evaluationId/requirementCode/status`：逐项要求结果；`reasonCode`：缺失、不适用或拒绝原因，可空；`evidenceCount`：支持证据数；`detailsHash`：受控详情哈希，可空 |
| `quality.sourceStatistics`         | `key/count`：按稳定统计键聚合的来源计数，不携带内部 candidate 或 provider response                                                                                 |
| `quality.exerciseStatistics`       | `key/count`：按 task、evidence、response 或 validation level 等稳定维度聚合的题目计数                                                                              |
| `quality.validationSummary`        | 非数组 object；`validatorVersion/errorCount/warningCount/contentHash`：validator 版本、错误/警告总数和报告哈希                                                     |

`LEARNER_CORE/v1` 要求每个 Sense 同时具有 learner definition、学习语言翻译和例句绑定。`STUDY_READY/v2` 复用这三项要求，并额外要求 learner explanation、接受型 Objective 和已验证 Exercise；因此缺少基础词典内容的 Sense 不能仅凭题目存在而被标记为可学习。profile version 或 requirement policy 改变时必须产生新的 `requirementsHash`。

`quality.validationSummary.contentHash` 是对按键序列化的 `{ errorCount, validatorVersion, warningCount }` 计算的 SHA-256；它不是初始化占位值，也不等同于 `manifest.contentHash`。最终 artifact 的 `errorCount` 必须为 `0`，读取方独立重算 summary hash，而 `manifest.contentHash` 再把整个 summary 绑定到 artifact 内容。

### 10.8 Typed target 允许范围

所有 target 都恰好包含 `targetKind` 和 `targetId`。同样的 JSON shape 在不同字段上有不同允许范围：

| Target type                | 允许的 `targetKind`                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| 通用 lexical target        | `HEADWORD/ENTRY/FORM/SENSE/CONCEPT/SENSE_EXAMPLE/COLLOCATION/FRAME/MORPHEME`                      |
| LearningObjective subject  | `SENSE/FORM/COLLOCATION/FRAME/SENSE_EXAMPLE`                                                      |
| PedagogicalMaterial target | `ENTRY/SENSE/FORM/MORPHEME/WORD_FORMATION/COLLOCATION/LEARNING_OBJECTIVE`                         |
| Proficiency target         | `HEADWORD/ENTRY/SENSE`                                                                            |
| Corpus target              | `ENTRY/FORM/SENSE`                                                                                |
| Word formation input       | `ENTRY/MORPHEME`                                                                                  |
| Etymology endpoint         | `ENTRY/ETYMON`                                                                                    |
| External identifier target | `ENTRY/SENSE/CONCEPT`                                                                             |
| Quality profile target     | `HEADWORD/ENTRY/FORM/SENSE/CONCEPT/LEARNING_OBJECTIVE/PEDAGOGICAL_MATERIAL/EXERCISE/BOOK_EDITION` |

### 10.9 怎样聚合一个单词详情

Artifact 不提供重复的逐词大对象。消费者需要按下列固定关系投影：

1. 用 `headwordRevisions.normalizedText/searchKey` 找到 `headwordId`，再读取对应 `headwords` identity。
2. 按 `entryRevisions.headwordId` 取得 Entry revision，并用 `entryId` 连接 `entries/forms/frames`。
3. 按 `forms.entryId -> formRepresentations.formId -> formFeatures.formId/formMedia.formId` 组装拼写、音标、屈折特征和媒体。
4. 按 `senseRevisions.entryId` 取得各义项；每个 Sense 分别连接 definition、translation、usage、example、collocation、predicate 和 Sense relation。
5. 对 relation 的 `targetId` 再读取目标 identity/revision；不能只显示 ID，也不能把所有 relation 错挂到第一个 Sense。
6. 通过 `objectiveSubjects.target` 反查学习目标，再按 Objective 连接 hints、ExerciseItem 和 ExerciseRevision。
7. 通过 `pedagogicalMaterialTargets.target` 取得教学材料；Stimulus 可以引用 immutable material revision，Exercise 再引用 Stimulus。
8. API 最终可输出方便前端的嵌套 `HeadwordDetail`，但该响应只是投影，不得反向成为 Artifact 或数据库事实模型。

## 11. 缺失、空数组与适用性

- 真正没有任何成员的 collection 输出 `[]`，不省略字段。
- 单个可选 scalar 使用 `null`，schema 不使用“缺字段也算合法”的模糊契约。
- 内容完成度在 `quality.profileEvaluations` 与 `quality.coverage` 中输出 `PRESENT / MISSING / NOT_APPLICABLE / REJECTED`。
- `MISSING` 不用空文本占位；`NOT_APPLICABLE` 必须有 profile rule reason。

## 12. 验证和 consumer 契约

consumer 必须按以下顺序处理：

1. 校验压缩文件 `artifactSha256`、压缩格式和压缩字节上限。
2. 在 compressed/decompressed byte 上限与 compression-ratio 上限内流式解压，只接受一个标准 zstd frame，拒绝 skippable/multiple frame、trailing data、截断和资源耗尽输入。compiler v1 默认上限为 512 MiB compressed、512 MiB decompressed、200:1；Runner/Importer 可以收紧但不能放宽已批准 manifest 的限制。
3. 限制 JSON 嵌套深度、字符串长度和数组 count；使用 JSON Schema 2020-12 校验完整 shape，拒绝未知 schema major。
4. 校验 manifest count、source checksum、content hash 和 stable array order。
5. 建立 disk-backed ID index 并验证每个 typed reference、language/vocabulary code；artifact 行不得携带数据库 `releaseId`。
6. 执行业务规则和 content profiles。
7. 全部通过后才允许打开数据库事务。

compiler 和 importer 使用 `@sylis/lexicon-contracts` 导出的同一 schema/type，不各自复制接口。CI 还会把 schema 中的所有数组与 importer mapping registry 双向比较，避免新增数据被静默忽略。第三方只需 JSON Schema 即可消费，不要求安装 NestJS、Prisma 或 compiler。

## 13. 单文件与大数据处理

Kaikki 使用 JSONL 是因为完整 Wiktionary 数据无法整体载入内存；Sylis 的目标是约 2 万核心学习 lemma 的精选 release，但仍不得 `JSON.stringify()` 整个对象。writer 按顶层数组流式产生 canonical JSON bytes，并直接接入单一 zstd stream；validator/importer 以相反方向流式解压到 JSON parser 和 disk-backed ID index，不落地第二份完整 `.json`。一个文件是交换要求，不代表一次性加载。

Compiler 固定 zstd implementation major、compression level、dictionary policy 和 frame checksum，使同一工具链的物理字节可复现；跨 compressor 实现只要求解压后的 `contentHash` 一致。发布完成前必须证明：压缩流结束后无额外 member/trailing bytes、JSON parser 只看到一个 root object、UTF-8 严格有效、末尾只有允许的 whitespace。
