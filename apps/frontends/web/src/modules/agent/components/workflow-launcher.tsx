import {
  BookOpen,
  Button,
  Field,
  IconButton,
  Select,
  SquarePen,
  X,
} from '@sylis/components';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import {
  AgentLearningWorkflow,
  AgentReadingDifficulty,
  AgentReadingGenre,
  AgentReadingLength,
  AgentReadingTheme,
  AgentReadingWordSource,
  type AgentReadingWorkflowConfiguration,
} from '../model/learning-workflow';

type ReadingWorkflow =
  | AgentLearningWorkflow.STORY_READING
  | AgentLearningWorkflow.CLOZE_READING;

const themeOptions = [
  { value: AgentReadingTheme.DAILY_LIFE, label: '日常生活' },
  { value: AgentReadingTheme.SCIENCE, label: '科学技术' },
  { value: AgentReadingTheme.TRAVEL, label: '旅行探险' },
  { value: AgentReadingTheme.BUSINESS, label: '商务职场' },
  { value: AgentReadingTheme.EDUCATION, label: '教育学习' },
  { value: AgentReadingTheme.ENVIRONMENT, label: '环境保护' },
  { value: AgentReadingTheme.CULTURE, label: '文化艺术' },
  { value: AgentReadingTheme.SPORTS, label: '体育运动' },
] as const;

const difficultyOptions = [
  { value: AgentReadingDifficulty.A2, label: 'A2 · 初级' },
  { value: AgentReadingDifficulty.B1, label: 'B1 · 中级' },
  { value: AgentReadingDifficulty.B2, label: 'B2 · 中高级' },
  { value: AgentReadingDifficulty.C1, label: 'C1 · 高级' },
] as const;

const lengthOptions = [
  { value: AgentReadingLength.SHORT, label: '短篇 · 100-200 词' },
  { value: AgentReadingLength.MEDIUM, label: '中篇 · 200-300 词' },
  { value: AgentReadingLength.LONG, label: '长篇 · 300-400 词' },
] as const;

const genreOptions = [
  { value: AgentReadingGenre.STORY, label: '故事' },
  { value: AgentReadingGenre.NEWS, label: '新闻' },
  { value: AgentReadingGenre.ESSAY, label: '议论文' },
  { value: AgentReadingGenre.CONVERSATION, label: '对话' },
] as const;

export function AgentWorkflowLauncher({
  workflow,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  workflow: ReadingWorkflow | null;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (configuration: AgentReadingWorkflowConfiguration) => void;
}) {
  const [wordSource, setWordSource] = useState(AgentReadingWordSource.CUSTOM);
  const [targetWords, setTargetWords] = useState('');
  const [theme, setTheme] = useState(AgentReadingTheme.DAILY_LIFE);
  const [difficulty, setDifficulty] = useState(AgentReadingDifficulty.A2);
  const [length, setLength] = useState(AgentReadingLength.SHORT);
  const [genre, setGenre] = useState(AgentReadingGenre.STORY);
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const parsedWords = useMemo(
    () =>
      [
        ...new Set(
          targetWords
            .split(/[\s,，、;；]+/u)
            .map((word) => word.trim())
            .filter(Boolean),
        ),
      ].slice(0, 10),
    [targetWords],
  );
  const open = workflow !== null;
  const title =
    workflow === AgentLearningWorkflow.CLOZE_READING ? '填空阅读' : '故事阅读';

  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    restoreFocusRef.current = active instanceof HTMLElement ? active : null;
    window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), select:not([disabled])',
        )
        ?.focus();
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      restoreFocusRef.current?.focus();
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    setWordSource(AgentReadingWordSource.CUSTOM);
    setTargetWords('');
    setTheme(AgentReadingTheme.DAILY_LIFE);
    setDifficulty(AgentReadingDifficulty.A2);
    setLength(AgentReadingLength.SHORT);
    setGenre(AgentReadingGenre.STORY);
  }, [open, workflow]);

  if (!workflow) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (
      pending ||
      (wordSource === AgentReadingWordSource.CUSTOM && parsedWords.length === 0)
    ) {
      return;
    }
    onSubmit({
      wordSource,
      targetWords: parsedWords,
      theme,
      difficulty,
      length,
      genre,
    });
  };

  return (
    <>
      <button
        type="button"
        className="agent-workflow-backdrop"
        aria-label="关闭生成设置"
        onClick={onClose}
      />
      <section
        ref={dialogRef}
        className="agent-workflow-launcher"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-workflow-launcher-title"
      >
        <header>
          <span>
            {workflow === AgentLearningWorkflow.CLOZE_READING ? (
              <SquarePen aria-hidden="true" />
            ) : (
              <BookOpen aria-hidden="true" />
            )}
          </span>
          <div>
            <h2 id="agent-workflow-launcher-title">{title}</h2>
            <p>
              {workflow === AgentLearningWorkflow.CLOZE_READING
                ? '生成可直接作答的语境练习'
                : '按学习目标生成专属阅读'}
            </p>
          </div>
          <IconButton icon={X} label="关闭生成设置" onClick={onClose} />
        </header>
        <form onSubmit={submit}>
          <fieldset className="agent-workflow-source" aria-label="单词来源">
            <legend>单词来源</legend>
            <button
              type="button"
              aria-pressed={wordSource === AgentReadingWordSource.CUSTOM}
              onClick={() => setWordSource(AgentReadingWordSource.CUSTOM)}
            >
              自定义单词
            </button>
            <button
              type="button"
              aria-pressed={wordSource === AgentReadingWordSource.WEAK_WORDS}
              onClick={() => setWordSource(AgentReadingWordSource.WEAK_WORDS)}
            >
              薄弱词汇
            </button>
          </fieldset>
          {wordSource === AgentReadingWordSource.CUSTOM ? (
            <Field
              label="目标单词"
              hint={`最多 10 个，已选择 ${parsedWords.length} 个`}
            >
              <textarea
                className="sy-input"
                aria-label="目标单词"
                value={targetWords}
                maxLength={500}
                placeholder="例如: curious, explore, discover"
                onChange={(event) => setTargetWords(event.target.value)}
              />
            </Field>
          ) : null}
          <div className="agent-workflow-options">
            <Field label="故事主题">
              <Select
                aria-label="故事主题"
                value={theme}
                onChange={(event) =>
                  setTheme(event.target.value as AgentReadingTheme)
                }
              >
                {themeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="难度">
              <Select
                aria-label="难度"
                value={difficulty}
                onChange={(event) =>
                  setDifficulty(event.target.value as AgentReadingDifficulty)
                }
              >
                {difficultyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="长度">
              <Select
                aria-label="长度"
                value={length}
                onChange={(event) =>
                  setLength(event.target.value as AgentReadingLength)
                }
              >
                {lengthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="文章类型">
              <Select
                aria-label="文章类型"
                value={genre}
                onChange={(event) =>
                  setGenre(event.target.value as AgentReadingGenre)
                }
              >
                {genreOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            icon={
              workflow === AgentLearningWorkflow.CLOZE_READING
                ? SquarePen
                : BookOpen
            }
            disabled={
              pending ||
              (wordSource === AgentReadingWordSource.CUSTOM &&
                parsedWords.length === 0)
            }
          >
            {pending
              ? '正在创建'
              : workflow === AgentLearningWorkflow.CLOZE_READING
                ? '生成练习'
                : '生成故事'}
          </Button>
        </form>
      </section>
    </>
  );
}
