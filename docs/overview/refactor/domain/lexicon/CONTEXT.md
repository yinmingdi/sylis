# Lexicon

本上下文描述可被来源证明、跨 release 稳定识别并供产品查询的词汇知识。

## Language

**Headword**:
同一语言中用于检索和展示的一组正字法字符串身份；它不是词性或词义。
_Avoid_: Word

**LexicalEntry**:
共享 lemma、词类和同形词/词源身份的一组形式与词义。
_Avoid_: Lexeme record, word row

**Form**:
一个 LexicalEntry 的书写、屈折或发音实现，包括过去式和过去分词。
_Avoid_: derived word, variant word

**Sense**:
LexicalEntry 在特定语义和用法范围内的可区分含义。
_Avoid_: meaning string, translation

**Concept**:
独立于具体语言表达的概念或 synset 身份。
_Avoid_: synonym group, definition

**Attestation**:
能够证明某一形式、词义或用法的来源语境。
_Avoid_: example text

**Collocation**:
绑定到明确 Sense、由观察证据支持的惯常词汇组合。
_Avoid_: phrase, related words

**SyntacticFrame**:
LexicalEntry 或 Sense 的句法行为及其论元槽位。
_Avoid_: grammar note, pattern string

**Morpheme**:
参与屈折或构词、具有稳定功能的最小形态单位。
_Avoid_: word root

**Provenance**:
一条正式事实从来源记录、构建活动和责任主体派生的证据链。
_Avoid_: source label

**LexiconRelease**:
一组经过验证、不可变且可原子激活的词典与学习内容版本。
_Avoid_: generic data release, import batch, current data
