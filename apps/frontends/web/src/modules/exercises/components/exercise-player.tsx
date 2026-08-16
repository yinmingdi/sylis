import {
  ExerciseCapturePolicy,
  ExerciseGradingMode,
  ExerciseResponseKind,
  type ExerciseResponse,
  type ExerciseView,
} from '@sylis/api-client/user';
import { Button, Check, Field, Headphones, TextInput } from '@sylis/components';
import { useEffect, useMemo, useRef, useState } from 'react';

export function ExercisePlayer({
  attempt,
  consentRecordId,
  onSubmit,
  onResult,
}: {
  attempt: ExerciseView;
  consentRecordId?: string;
  onSubmit: (
    attemptId: string,
    response: ExerciseResponse,
    idempotencyKey: string,
  ) => Promise<unknown>;
  onResult?: (result: Readonly<Record<string, unknown>>) => void;
}) {
  const { exercise } = attempt;
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [selfReported, setSelfReported] = useState<boolean>();
  const [result, setResult] = useState<Record<string, unknown>>();
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const multi = exercise.responseCardinality === 'MULTIPLE';
  const choiceConfig =
    exercise.responseConfig?.responseKind === ExerciseResponseKind.CHOICE
      ? exercise.responseConfig
      : null;
  const extendedTextConfig =
    exercise.responseConfig?.responseKind === ExerciseResponseKind.EXTENDED_TEXT
      ? exercise.responseConfig
      : null;
  const textCapturePolicy =
    exercise.responseConfig?.responseKind === ExerciseResponseKind.SHORT_TEXT ||
    exercise.responseConfig?.responseKind === ExerciseResponseKind.EXTENDED_TEXT
      ? exercise.responseConfig.capturePolicy
      : null;
  const requiresSelfReport =
    exercise.gradingMode === ExerciseGradingMode.SELF_REPORT;
  const requiresRetentionConsent =
    textCapturePolicy === ExerciseCapturePolicy.REQUIRED;
  const promptStimuli = exercise.stimuli.filter(
    (stimulus) => stimulus.roleCode !== 'REVEAL',
  );
  const revealStimuli = exercise.stimuli.filter(
    (stimulus) => stimulus.roleCode === 'REVEAL',
  );
  const hasRevealContent =
    revealStimuli.length > 0 || exercise.rubrics.length > 0;
  const minimumSelections = choiceConfig?.minSelections ?? 1;
  const maximumSelections = choiceConfig?.maxSelections ?? 1;
  const characterCount = [...text].length;
  const wordCount = text.trim() ? text.trim().split(/\s+/u).length : 0;
  const textWithinLimits =
    characterCount >= (extendedTextConfig?.minCharacters ?? 1) &&
    characterCount <= (extendedTextConfig?.maxCharacters ?? 10_000) &&
    wordCount >= (extendedTextConfig?.minWords ?? 0) &&
    wordCount <= (extendedTextConfig?.maxWords ?? Number.MAX_SAFE_INTEGER);

  useEffect(() => {
    setSelected([]);
    setText('');
    setRevealed(false);
    setSelfReported(undefined);
    setResult(undefined);
    setBusy(false);
    idempotencyKey.current = crypto.randomUUID();
  }, [attempt.id]);

  const response = useMemo<ExerciseResponse | null>(() => {
    if (exercise.responseKind === ExerciseResponseKind.CHOICE) {
      return selected.length >= minimumSelections &&
        selected.length <= maximumSelections
        ? { responseKind: ExerciseResponseKind.CHOICE, choiceIds: selected }
        : null;
    }
    if (
      exercise.responseKind === ExerciseResponseKind.SHORT_TEXT ||
      exercise.responseKind === ExerciseResponseKind.EXTENDED_TEXT
    ) {
      if (
        !text.trim() ||
        !textWithinLimits ||
        (requiresRetentionConsent && !consentRecordId) ||
        (requiresSelfReport && (!revealed || selfReported === undefined))
      ) {
        return null;
      }
      return {
        responseKind: exercise.responseKind,
        text,
        ...(consentRecordId ? { consentRecordId } : {}),
        ...(requiresSelfReport
          ? { selfReported, revealAcknowledged: true as const }
          : {}),
      };
    }
    return !revealed || selfReported === undefined
      ? null
      : {
          responseKind: ExerciseResponseKind.NO_CAPTURE,
          selfReported,
          revealAcknowledged: true,
        };
  }, [
    consentRecordId,
    exercise.responseKind,
    maximumSelections,
    minimumSelections,
    revealed,
    requiresRetentionConsent,
    requiresSelfReport,
    selected,
    selfReported,
    text,
    textWithinLimits,
  ]);

  const submit = async () => {
    if (!response) return;
    setBusy(true);
    try {
      const submitted = (await onSubmit(
        attempt.id,
        response,
        idempotencyKey.current,
      )) as Record<string, unknown>;
      setResult(submitted);
      onResult?.(submitted);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="exercise-player" aria-label="单词练习">
      <div className="exercise-player__meta">
        <span>{exercise.taskKind.replaceAll('_', ' ')}</span>
        <span>{exercise.responseCardinality}</span>
      </div>
      {promptStimuli.length > 0 ? (
        <div className="exercise-stimuli">
          {promptStimuli.flatMap((stimulus) =>
            stimulus.stimulusRevision.blocks.map((block) => (
              <StimulusBlock key={block.id} block={block} />
            )),
          )}
        </div>
      ) : null}
      <h2>{exercise.prompt.text}</h2>
      {exercise.instructions ? <p>{exercise.instructions}</p> : null}
      {exercise.responseKind === ExerciseResponseKind.CHOICE ? (
        <div
          className="exercise-choices"
          role={multi ? 'group' : 'radiogroup'}
          aria-label="答案选项"
        >
          {exercise.choices.map((choice) => {
            const active = selected.includes(choice.id);
            const limitReached =
              multi && !active && selected.length >= maximumSelections;
            return (
              <button
                key={choice.id}
                type="button"
                role={multi ? 'checkbox' : 'radio'}
                aria-checked={active}
                disabled={limitReached || Boolean(result)}
                onClick={() =>
                  setSelected((current) =>
                    multi
                      ? active
                        ? current.filter((id) => id !== choice.id)
                        : [...current, choice.id]
                      : [choice.id],
                  )
                }
              >
                <span>{active ? <Check size={17} /> : null}</span>
                {choice.text}
              </button>
            );
          })}
        </div>
      ) : null}
      {exercise.responseKind === ExerciseResponseKind.SHORT_TEXT ? (
        <Field label="单词答案">
          <TextInput
            value={text}
            maxLength={10_000}
            disabled={Boolean(result)}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
      ) : null}
      {exercise.responseKind === ExerciseResponseKind.EXTENDED_TEXT ? (
        <Field label="句子答案">
          <textarea
            className="sy-input exercise-textarea"
            value={text}
            maxLength={extendedTextConfig?.maxCharacters ?? 10_000}
            disabled={Boolean(result)}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
      ) : null}
      {requiresSelfReport && !revealed && hasRevealContent ? (
        <Button
          type="button"
          tone="secondary"
          disabled={
            Boolean(result) ||
            (exercise.responseKind !== ExerciseResponseKind.NO_CAPTURE &&
              (!text.trim() || !textWithinLimits))
          }
          onClick={() => setRevealed(true)}
        >
          {exercise.responseKind === ExerciseResponseKind.NO_CAPTURE
            ? '查看参考'
            : exercise.rubrics.length > 0
              ? '查看评分标准'
              : '查看参考答案'}
        </Button>
      ) : null}
      {requiresSelfReport && revealed && revealStimuli.length > 0 ? (
        <div className="exercise-stimuli" aria-label="参考内容">
          {revealStimuli.flatMap((stimulus) =>
            stimulus.stimulusRevision.blocks.map((block) => (
              <StimulusBlock key={block.id} block={block} />
            )),
          )}
        </div>
      ) : null}
      {requiresSelfReport && revealed && exercise.rubrics.length > 0 ? (
        <div className="exercise-rubric" aria-label="自评标准">
          <strong>自评标准</strong>
          <ul>
            {exercise.rubrics.map((rubric) => (
              <li key={rubric.id}>{rubric.description}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {requiresSelfReport && revealed ? (
        <div className="self-report">
          {exercise.responseKind === ExerciseResponseKind.NO_CAPTURE ? (
            <Headphones aria-hidden="true" />
          ) : null}
          <span>
            {exercise.responseKind === ExerciseResponseKind.NO_CAPTURE
              ? '完成练习'
              : '按标准自评'}
          </span>
          <Button
            type="button"
            tone={selfReported === true ? 'primary' : 'secondary'}
            disabled={Boolean(result)}
            onClick={() => setSelfReported(true)}
          >
            已完成
          </Button>
          <Button
            type="button"
            tone={selfReported === false ? 'primary' : 'secondary'}
            disabled={Boolean(result)}
            onClick={() => setSelfReported(false)}
          >
            需要重练
          </Button>
        </div>
      ) : null}
      <div className="exercise-player__footer">
        {result ? (
          <span
            className={
              result.correct === true ? 'result-correct' : 'result-neutral'
            }
          >
            {result.correct === true
              ? '回答正确'
              : result.correct === false
                ? '已记录，继续巩固'
                : result.selfReported === true
                  ? '已记录为掌握'
                  : result.selfReported === false
                    ? '已安排重练'
                    : '回答已记录'}
          </span>
        ) : (
          <span />
        )}
        <Button
          type="button"
          disabled={!response || busy || Boolean(result)}
          onClick={submit}
        >
          {busy ? '提交中' : '提交答案'}
        </Button>
      </div>
    </section>
  );
}

type StimulusBlockView =
  ExerciseView['exercise']['stimuli'][number]['stimulusRevision']['blocks'][number];
type MaterialBlockView = NonNullable<
  StimulusBlockView['material']
>['blocks'][number];

function Media({ media }: { media: NonNullable<MaterialBlockView['media']> }) {
  if (media.mimeType.startsWith('audio/')) {
    return <audio controls preload="none" src={media.contentUri} />;
  }
  if (media.mimeType.startsWith('video/')) {
    return <video controls preload="metadata" src={media.contentUri} />;
  }
  if (media.mimeType.startsWith('image/')) {
    return <img loading="lazy" src={media.contentUri} alt="" />;
  }
  return null;
}

function ContentBlock({ block }: { block: MaterialBlockView }) {
  return (
    <div>
      {block.text ? <p>{block.text}</p> : null}
      {block.example ? (
        <blockquote>
          <p>{block.example.text}</p>
          {block.example.translations.map((translation) => (
            <footer key={translation.id}>{translation.text}</footer>
          ))}
        </blockquote>
      ) : null}
      {block.media ? <Media media={block.media} /> : null}
    </div>
  );
}

function StimulusBlock({ block }: { block: StimulusBlockView }) {
  return (
    <div className="exercise-stimulus-block" data-kind={block.blockKind}>
      <ContentBlock block={block} />
      {block.material ? (
        <div className="exercise-material">
          <strong>{block.material.kind.replaceAll('_', ' ')}</strong>
          {block.material.blocks.map((materialBlock) => (
            <ContentBlock key={materialBlock.id} block={materialBlock} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
