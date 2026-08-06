import type { ExerciseResponse, ExerciseView } from "@sylis/api-client";
import { Button, Check, Field, Headphones, TextInput } from "@sylis/components";
import { useEffect, useMemo, useRef, useState } from "react";

export function ExercisePlayer({
  attempt,
  consentRecordId,
  onSubmit,
}: {
  attempt: ExerciseView;
  consentRecordId?: string;
  onSubmit: (
    attemptId: string,
    response: ExerciseResponse,
    idempotencyKey: string,
  ) => Promise<unknown>;
}) {
  const { exercise } = attempt;
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [selfReported, setSelfReported] = useState<boolean>();
  const [result, setResult] = useState<Record<string, unknown>>();
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const multi = exercise.responseCardinality === "MULTIPLE";
  const minimumSelections = exercise.responseConfig?.minSelections ?? 1;
  const maximumSelections = exercise.responseConfig?.maxSelections ?? 1;
  const characterCount = [...text].length;
  const wordCount = text.trim() ? text.trim().split(/\s+/u).length : 0;
  const textWithinLimits =
    characterCount >= (exercise.responseConfig?.minCharacters ?? 1) &&
    characterCount <= (exercise.responseConfig?.maxCharacters ?? 10_000) &&
    wordCount >= (exercise.responseConfig?.minWords ?? 0) &&
    wordCount <= (exercise.responseConfig?.maxWords ?? Number.MAX_SAFE_INTEGER);

  useEffect(() => {
    setSelected([]);
    setText("");
    setSelfReported(undefined);
    setResult(undefined);
    setBusy(false);
    idempotencyKey.current = crypto.randomUUID();
  }, [attempt.id]);

  const response = useMemo<ExerciseResponse | null>(() => {
    if (exercise.responseKind === "CHOICE") {
      return selected.length >= minimumSelections &&
        selected.length <= maximumSelections
        ? { responseKind: "CHOICE", choiceIds: selected }
        : null;
    }
    if (
      exercise.responseKind === "SHORT_TEXT" ||
      exercise.responseKind === "EXTENDED_TEXT"
    ) {
      return text.trim() && textWithinLimits && consentRecordId
        ? { responseKind: exercise.responseKind, text, consentRecordId }
        : null;
    }
    return selfReported === undefined
      ? null
      : { responseKind: "NO_CAPTURE", selfReported };
  }, [
    consentRecordId,
    exercise.responseKind,
    maximumSelections,
    minimumSelections,
    selected,
    selfReported,
    text,
    textWithinLimits,
  ]);

  const submit = async () => {
    if (!response) return;
    setBusy(true);
    try {
      setResult(
        (await onSubmit(
          attempt.id,
          response,
          idempotencyKey.current,
        )) as Record<string, unknown>,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="exercise-player">
      <div className="exercise-player__meta">
        <span>{exercise.taskKind.replaceAll("_", " ")}</span>
        <span>{exercise.responseCardinality}</span>
      </div>
      {exercise.stimuli.length > 0 ? (
        <div className="exercise-stimuli">
          {exercise.stimuli.flatMap((stimulus) =>
            stimulus.stimulusRevision.blocks.map((block) => (
              <StimulusBlock key={block.id} block={block} />
            )),
          )}
        </div>
      ) : null}
      <h2>{exercise.prompt.text}</h2>
      {exercise.instructions ? <p>{exercise.instructions}</p> : null}
      {exercise.responseKind === "CHOICE" ? (
        <div
          className="exercise-choices"
          role={multi ? "group" : "radiogroup"}
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
                role={multi ? "checkbox" : "radio"}
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
      {exercise.responseKind === "SHORT_TEXT" ? (
        <Field label="你的答案">
          <TextInput
            value={text}
            maxLength={exercise.responseConfig?.maxCharacters ?? 10_000}
            disabled={Boolean(result)}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
      ) : null}
      {exercise.responseKind === "EXTENDED_TEXT" ? (
        <Field label="你的答案">
          <textarea
            className="sy-input exercise-textarea"
            value={text}
            maxLength={exercise.responseConfig?.maxCharacters ?? 10_000}
            disabled={Boolean(result)}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
      ) : null}
      {exercise.responseKind === "NO_CAPTURE" ? (
        <div className="self-report">
          <Headphones aria-hidden="true" />
          <span>完成练习</span>
          <Button
            type="button"
            tone={selfReported === true ? "primary" : "secondary"}
            disabled={Boolean(result)}
            onClick={() => setSelfReported(true)}
          >
            已完成
          </Button>
          <Button
            type="button"
            tone={selfReported === false ? "primary" : "secondary"}
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
              result.correct === true ? "result-correct" : "result-neutral"
            }
          >
            {result.correct === true
              ? "回答正确"
              : result.correct === false
                ? "已记录，继续巩固"
                : "回答已记录"}
          </span>
        ) : (
          <span />
        )}
        <Button
          type="button"
          disabled={!response || busy || Boolean(result)}
          onClick={submit}
        >
          {busy ? "提交中" : "提交答案"}
        </Button>
      </div>
    </div>
  );
}

type StimulusBlockView =
  ExerciseView["exercise"]["stimuli"][number]["stimulusRevision"]["blocks"][number];
type MaterialBlockView = NonNullable<
  StimulusBlockView["material"]
>["blocks"][number];

function Media({ media }: { media: NonNullable<MaterialBlockView["media"]> }) {
  if (media.mimeType.startsWith("audio/")) {
    return <audio controls preload="none" src={media.contentUri} />;
  }
  if (media.mimeType.startsWith("video/")) {
    return <video controls preload="metadata" src={media.contentUri} />;
  }
  if (media.mimeType.startsWith("image/")) {
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
          <strong>{block.material.kind.replaceAll("_", " ")}</strong>
          {block.material.blocks.map((materialBlock) => (
            <ContentBlock key={materialBlock.id} block={materialBlock} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
