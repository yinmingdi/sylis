# Learning and Assessment

本上下文把要掌握的知识、用于取得证据的题目、实际作答和记忆调度分开。

## Language

**VocabularyBook**:
一个稳定命名的课程集合；实际内容由不可变 Edition 定义。
_Avoid_: word list, Book row

**BookEdition**:
按顺序引用学习目标的不可变词书版本。
_Avoid_: current book data

**Enrollment**:
User 对一个 BookEdition 的学习承诺与计划设置。
_Avoid_: UserBook, selected book

**LearningObjective**:
一个学习者需要掌握的最小知识目标，由词汇 subject、知识维度和接受/产出方向定义。
_Avoid_: StudyCard, Word status

**PedagogicalMaterial**:
围绕明确词汇或学习目标、可独立展示并可被题目复用的版本化教学材料；它解释正式事实，但不是词典事实本身。
_Avoid_: AI content, word article, definition blob

**Stimulus**:
可以被多道 Exercise 复用的作答上下文；它可以组合例句、媒体或 PedagogicalMaterial。
_Avoid_: question passage

**Exercise**:
针对一个 primary LearningObjective 获取可评分或可自评证据的可版本化任务。
_Avoid_: Quiz, Card, question blob

**ExerciseAttempt**:
学习者实际看见的题目版本、选项顺序、响应和结果组成的不可变事实。
_Avoid_: answer row, progress update

**ReviewEvent**:
一次已提交学习 Attempt 经学习者评分后产生的记忆调度事件。
_Avoid_: review counter

**MemoryState**:
User 对一个 LearningObjective 的当前可重放调度快照。
_Avoid_: word mastery, proficiency score

**AssessmentBlueprint**:
规定测什么、需要什么证据以及怎样组题的版本化规则。
_Avoid_: test type, random quiz

**AssessmentSession**:
一次固定 release、blueprint、题目、顺序和评分版本的正式测评实例。
_Avoid_: VocabularyTest

**Notebook**:
User 主动收集明确词汇 target 的命名集合。
_Avoid_: word favorites
