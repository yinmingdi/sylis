import {
  AgentArtifactKind,
  AgentGrammarObservationCategory,
  AgentObservationSeverity,
  ExerciseFeedbackOutcome,
  ExerciseResponseCardinality,
  ExerciseResponseKind,
  ExerciseStimulusRole,
  ExerciseTaskKind,
  type AgentArtifactDocument,
} from '@sylis/api-client/agent';
import { Button, Check, RefreshCw } from '@sylis/components';
import { useState } from 'react';

export function AgentArtifactDocumentView({
  document,
}: {
  document: AgentArtifactDocument;
}) {
  switch (document.artifactKind) {
    case AgentArtifactKind.ARTICLE:
      return (
        <div className="agent-document">
          <DocumentSummary value={document.summary} />
          <dl className="agent-document__meta">
            <div>
              <dt>语言</dt>
              <dd>{document.languageTag}</dd>
            </div>
            <div>
              <dt>难度</dt>
              <dd>{document.cefrLevel}</dd>
            </div>
            <div>
              <dt>体裁</dt>
              <dd>{document.genre}</dd>
            </div>
          </dl>
          {document.sections.map((section, index) => (
            <section key={`${section.heading ?? 'section'}:${index}`}>
              {section.heading ? <h3>{section.heading}</h3> : null}
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex}>{paragraph}</p>
              ))}
            </section>
          ))}
          {document.glossary.length > 0 ? (
            <section>
              <h3>词汇</h3>
              <dl>
                {document.glossary.map((item, index) => (
                  <div key={`${item.term}:${index}`}>
                    <dt>{item.term}</dt>
                    <dd>{item.meaning}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      );
    case AgentArtifactKind.GRAMMAR_ANALYSIS:
      return (
        <div className="agent-document">
          <DocumentSummary value={document.summary} />
          <blockquote>{document.source.text}</blockquote>
          {document.observations.map((observation) => (
            <section key={observation.localId}>
              <h3>{grammarObservationCategoryLabel(observation.category)}</h3>
              <small>
                {observationSeverityLabel(observation.severity)}
                {observation.span ? ` · ${observation.span.text}` : ''}
              </small>
              <p>{observation.explanation}</p>
              <p>{observation.evidence}</p>
              {observation.suggestion ? <p>{observation.suggestion}</p> : null}
            </section>
          ))}
          <section>
            <h3>修订结果</h3>
            <p>{document.revision.text}</p>
          </section>
        </div>
      );
    case AgentArtifactKind.TRANSLATION_ANALYSIS:
      return (
        <div className="agent-document">
          <DocumentSummary value={document.summary} />
          <blockquote>{document.source.text}</blockquote>
          <section>
            <h3>推荐译文</h3>
            <p>{document.recommended.text}</p>
            <small>{document.recommended.register}</small>
            <p>{document.recommended.rationale}</p>
          </section>
          {document.alternatives.length > 0 ? (
            <section>
              <h3>其他译法</h3>
              {document.alternatives.map((item, index) => (
                <div key={index}>
                  <strong>{item.text}</strong>
                  <small>{item.register}</small>
                  <p>{item.tradeoffs}</p>
                </div>
              ))}
            </section>
          ) : null}
          {document.alignments.length > 0 ? (
            <section>
              <h3>表达对齐</h3>
              {document.alignments.map((item, index) => (
                <div key={index}>
                  <strong>
                    {item.sourceText} → {item.targetText}
                  </strong>
                  <p>{item.explanation}</p>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      );
    case AgentArtifactKind.LEXICON_EXPLANATION:
      return (
        <div className="agent-document">
          <DocumentSummary value={document.summary} />
          {document.forms.length > 0 ? (
            <section>
              <h3>词形与发音</h3>
              {document.forms.map((form, index) => (
                <div key={`${form.text}:${index}`}>
                  <strong>{form.text}</strong>
                  <small>{form.formType}</small>
                  {form.pronunciations.map(
                    (pronunciation, pronunciationIndex) => (
                      <span key={pronunciationIndex}>
                        {pronunciation.value}
                        {pronunciation.region
                          ? ` (${pronunciation.region})`
                          : ''}
                      </span>
                    ),
                  )}
                </div>
              ))}
            </section>
          ) : null}
          {document.senses.map((sense) => (
            <section key={sense.localId}>
              <h3>
                {sense.partOfSpeech} · {sense.definition}
              </h3>
              <p>{sense.learnerExplanation}</p>
              {sense.translations.length > 0 ? (
                <p>{sense.translations.map(({ text }) => text).join('；')}</p>
              ) : null}
              {sense.examples.length > 0 ? (
                <div>
                  <strong>例句</strong>
                  {sense.examples.map((example, index) => (
                    <blockquote key={index}>
                      {example.text}
                      {example.translation ? (
                        <small>{example.translation}</small>
                      ) : null}
                    </blockquote>
                  ))}
                </div>
              ) : null}
              {sense.collocations.length > 0 ? (
                <div>
                  <strong>搭配</strong>
                  <ul>
                    {sense.collocations.map((item, index) => (
                      <li key={index}>
                        <span>{item.text}</span>：{item.explanation}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {sense.relations.length > 0 ? (
                <div>
                  <strong>词义关系</strong>
                  <ul>
                    {sense.relations.map((relation, index) => (
                      <li key={index}>
                        {relation.relationKind} · {relation.label}
                        {relation.explanation
                          ? `：${relation.explanation}`
                          : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ))}
          {document.morphology.morphemes.length > 0 ? (
            <section>
              <h3>词根词缀</h3>
              <ul>
                {document.morphology.morphemes.map((item, index) => (
                  <li key={index}>
                    <strong>{item.form}</strong> · {item.kind} · {item.meaning}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {document.etymology.summary ? (
            <section>
              <h3>词源</h3>
              <p>{document.etymology.summary}</p>
            </section>
          ) : null}
        </div>
      );
    case AgentArtifactKind.PRACTICE_SET:
      return <AgentPracticeDocument document={document} />;
    case AgentArtifactKind.STUDY_PLAN:
      return (
        <div className="agent-document">
          <DocumentSummary value={document.summary} />
          <p>
            {document.startDate} 至 {document.endDate}
          </p>
          <section>
            <h3>目标</h3>
            <ol>
              {document.goals.map((goal) => (
                <li key={goal.localId}>
                  <strong>{goal.description}</strong>
                  <ul>
                    {goal.successCriteria.map((criterion, index) => (
                      <li key={index}>{criterion}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h3>安排</h3>
            {document.sessions.map((session) => (
              <div key={session.localId}>
                <strong>
                  {session.scheduledDate} · {session.estimatedMinutes} 分钟
                </strong>
                <ul>
                  {session.tasks.map((task, index) => (
                    <li key={index}>
                      {task.taskKind} · {task.description}
                      <small>{task.rationale}</small>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      );
  }
}

function DocumentSummary({ value }: { value: string }) {
  return <p className="agent-document__summary">{value}</p>;
}

type PracticeDocument = Extract<
  AgentArtifactDocument,
  { artifactKind: AgentArtifactKind.PRACTICE_SET }
>;
type PracticeExercise = PracticeDocument['candidateSet']['exercises'][number];
type PracticeResponse = string | readonly string[] | boolean;

function AgentPracticeDocument({ document }: { document: PracticeDocument }) {
  const [responses, setResponses] = useState<
    Readonly<Record<string, PracticeResponse>>
  >({});
  const [submitted, setSubmitted] = useState<ReadonlySet<string>>(new Set());
  const completed = submitted.size;

  const setResponse = (exerciseId: string, response: PracticeResponse) => {
    setResponses((current) => ({ ...current, [exerciseId]: response }));
  };

  return (
    <div className="agent-document agent-practice">
      <DocumentSummary value={document.summary} />
      <div className="agent-practice__progress">
        <span>
          已完成 {completed} / {document.candidateSet.exercises.length}
        </span>
        {completed > 0 ? (
          <Button
            type="button"
            tone="quiet"
            icon={RefreshCw}
            onClick={() => {
              setResponses({});
              setSubmitted(new Set());
            }}
          >
            重新练习
          </Button>
        ) : null}
      </div>
      {document.candidateSet.exercises.map((exercise, index) => {
        const response = responses[exercise.localId];
        const isSubmitted = submitted.has(exercise.localId);
        const correct = isSubmitted
          ? practiceResponseCorrect(exercise, response)
          : null;
        const feedback = isSubmitted
          ? exercise.feedback.filter(
              (item) =>
                item.outcome === ExerciseFeedbackOutcome.ANY ||
                (correct === true &&
                  item.outcome === ExerciseFeedbackOutcome.CORRECT) ||
                (correct === false &&
                  item.outcome === ExerciseFeedbackOutcome.INCORRECT),
            )
          : [];
        const contextualStimuli = exercise.stimuli.filter(
          (item) => item.role !== ExerciseStimulusRole.REVEAL,
        );
        const revealStimuli = exercise.stimuli.filter(
          (item) => item.role === ExerciseStimulusRole.REVEAL,
        );
        return (
          <section className="agent-practice__exercise" key={exercise.localId}>
            <small>
              第 {index + 1} 题 · {exerciseTaskLabel(exercise.exerciseTaskKind)}
            </small>
            {contextualStimuli.map((stimulus) => (
              <blockquote key={stimulus.localId}>{stimulus.text}</blockquote>
            ))}
            <h3>{exercise.prompt.text}</h3>
            {exercise.instructions ? <p>{exercise.instructions}</p> : null}
            <PracticeResponseControl
              exercise={exercise}
              response={response}
              disabled={isSubmitted}
              onChange={(value) => setResponse(exercise.localId, value)}
            />
            {isSubmitted ? (
              <div
                className="agent-practice__feedback"
                data-correct={correct === true}
                role="status"
              >
                <strong>
                  {correct === true
                    ? '回答正确'
                    : correct === false
                      ? '再看一下标准答案'
                      : '已完成'}
                </strong>
                {correct === false ? (
                  <p>{practiceCorrectAnswer(exercise)}</p>
                ) : null}
                {revealStimuli.map((stimulus) => (
                  <p key={stimulus.localId}>{stimulus.text}</p>
                ))}
                {feedback.map((item, feedbackIndex) => (
                  <p key={`${item.outcome}:${feedbackIndex}`}>{item.text}</p>
                ))}
              </div>
            ) : (
              <Button
                type="button"
                icon={Check}
                disabled={!practiceResponseReady(exercise, response)}
                onClick={() =>
                  setSubmitted(
                    (current) => new Set([...current, exercise.localId]),
                  )
                }
              >
                提交答案
              </Button>
            )}
          </section>
        );
      })}
    </div>
  );
}

function PracticeResponseControl({
  exercise,
  response,
  disabled,
  onChange,
}: {
  exercise: PracticeExercise;
  response?: PracticeResponse;
  disabled: boolean;
  onChange: (value: PracticeResponse) => void;
}) {
  if (exercise.responseKind === ExerciseResponseKind.CHOICE) {
    const selected = Array.isArray(response) ? response : [];
    const multiple =
      exercise.responseCardinality === ExerciseResponseCardinality.MULTIPLE;
    return (
      <div
        className="agent-practice__choices"
        role={multiple ? 'group' : 'radiogroup'}
        aria-label="答案选项"
      >
        {exercise.choices.map((choice) => {
          const active = selected.includes(choice.localId);
          return (
            <button
              key={choice.localId}
              type="button"
              role={multiple ? 'checkbox' : 'radio'}
              aria-checked={active}
              disabled={disabled}
              onClick={() =>
                onChange(
                  multiple
                    ? active
                      ? selected.filter((id) => id !== choice.localId)
                      : [...selected, choice.localId]
                    : [choice.localId],
                )
              }
            >
              <span>
                {active ? <Check aria-hidden="true" size={16} /> : null}
              </span>
              {choice.text}
            </button>
          );
        })}
      </div>
    );
  }
  if (
    exercise.responseKind === ExerciseResponseKind.SHORT_TEXT ||
    exercise.responseKind === ExerciseResponseKind.EXTENDED_TEXT
  ) {
    return (
      <textarea
        className="sy-input agent-practice__text"
        aria-label="填写答案"
        value={typeof response === 'string' ? response : ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <div
      className="agent-practice__self-report"
      role="group"
      aria-label="完成情况"
    >
      <Button
        type="button"
        tone={response === true ? 'primary' : 'secondary'}
        disabled={disabled}
        onClick={() => onChange(true)}
      >
        已完成
      </Button>
      <Button
        type="button"
        tone={response === false ? 'primary' : 'secondary'}
        disabled={disabled}
        onClick={() => onChange(false)}
      >
        需要重练
      </Button>
    </div>
  );
}

function practiceResponseReady(
  exercise: PracticeExercise,
  response?: PracticeResponse,
): boolean {
  if (exercise.responseKind === ExerciseResponseKind.CHOICE) {
    return Array.isArray(response) && response.length > 0;
  }
  if (
    exercise.responseKind === ExerciseResponseKind.SHORT_TEXT ||
    exercise.responseKind === ExerciseResponseKind.EXTENDED_TEXT
  ) {
    return typeof response === 'string' && Boolean(response.trim());
  }
  return typeof response === 'boolean';
}

function practiceResponseCorrect(
  exercise: PracticeExercise,
  response?: PracticeResponse,
): boolean | null {
  if (exercise.responseKind === ExerciseResponseKind.CHOICE) {
    if (!Array.isArray(response)) return false;
    const expected = exercise.correctResponses
      .filter((item) => item.responseKind === ExerciseResponseKind.CHOICE)
      .map((item) => item.choiceId)
      .sort();
    return [...response].sort().join('|') === expected.join('|');
  }
  if (exercise.responseKind === ExerciseResponseKind.SHORT_TEXT) {
    if (typeof response !== 'string') return false;
    const normalized = response.trim().toLocaleLowerCase();
    return exercise.correctResponses
      .filter((item) => item.responseKind === ExerciseResponseKind.SHORT_TEXT)
      .some((item) => item.text.trim().toLocaleLowerCase() === normalized);
  }
  return null;
}

function practiceCorrectAnswer(exercise: PracticeExercise): string {
  const answers = exercise.correctResponses.map((item) => {
    if (item.responseKind === ExerciseResponseKind.CHOICE) {
      return (
        exercise.choices.find((choice) => choice.localId === item.choiceId)
          ?.text ?? item.choiceId
      );
    }
    if (item.responseKind === ExerciseResponseKind.SHORT_TEXT) return item.text;
    return exercise.rubrics.find(
      (rubric) => rubric.localId === item.rubricCriterionId,
    )?.description;
  });
  return answers.filter(Boolean).join('；');
}

function grammarObservationCategoryLabel(
  category: AgentGrammarObservationCategory,
): string {
  const labels: Readonly<Record<AgentGrammarObservationCategory, string>> = {
    [AgentGrammarObservationCategory.AGREEMENT]: '主谓一致',
    [AgentGrammarObservationCategory.ARTICLE]: '冠词',
    [AgentGrammarObservationCategory.CLAUSE]: '从句',
    [AgentGrammarObservationCategory.MODIFIER]: '修饰语',
    [AgentGrammarObservationCategory.PUNCTUATION]: '标点',
    [AgentGrammarObservationCategory.TENSE_ASPECT]: '时态与体',
    [AgentGrammarObservationCategory.VOICE]: '语态',
    [AgentGrammarObservationCategory.WORD_CHOICE]: '用词',
    [AgentGrammarObservationCategory.WORD_ORDER]: '语序',
    [AgentGrammarObservationCategory.OTHER]: '结构分析',
  };
  return labels[category];
}

function observationSeverityLabel(severity: AgentObservationSeverity): string {
  const labels: Readonly<Record<AgentObservationSeverity, string>> = {
    [AgentObservationSeverity.INFO]: '说明',
    [AgentObservationSeverity.SUGGESTION]: '建议',
    [AgentObservationSeverity.ERROR]: '需要修正',
  };
  return labels[severity];
}

function exerciseTaskLabel(task: ExerciseTaskKind): string {
  const labels: Readonly<Record<ExerciseTaskKind, string>> = {
    [ExerciseTaskKind.FORM_MEANING_MAPPING]: '词形与词义匹配',
    [ExerciseTaskKind.SPOKEN_FORM_MAPPING]: '发音辨认',
    [ExerciseTaskKind.SPOKEN_FORM_PRODUCTION]: '发音练习',
    [ExerciseTaskKind.CONTEXTUAL_SENSE_INTERPRETATION]: '语境词义判断',
    [ExerciseTaskKind.CONTEXTUAL_FORM_COMPLETION]: '语境填空',
    [ExerciseTaskKind.COLLOCATION_RECALL]: '搭配回忆',
    [ExerciseTaskKind.FRAME_COMPLETION]: '句型补全',
    [ExerciseTaskKind.SEMANTIC_RELATION_DISCRIMINATION]: '词义关系判断',
    [ExerciseTaskKind.MORPHEME_ANALYSIS]: '词根词缀分析',
    [ExerciseTaskKind.WORD_FORMATION]: '构词练习',
    [ExerciseTaskKind.USAGE_CONSTRAINT_DISCRIMINATION]: '用法辨析',
    [ExerciseTaskKind.SENTENCE_TRANSLATION]: '句子翻译',
    [ExerciseTaskKind.SENTENCE_PRODUCTION]: '句子表达',
  };
  return labels[task];
}
