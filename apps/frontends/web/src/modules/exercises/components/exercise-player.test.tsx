import {
  ExerciseCapturePolicy,
  ExerciseDiacriticPolicy,
  ExerciseGradingMode,
  ExerciseResponseCardinality,
  ExerciseResponseKind,
  ExerciseResponsePlacement,
  ExerciseTaskKind,
  ExerciseValidationLevel,
  ExerciseWhitespacePolicy,
  type ExerciseView,
} from '@sylis/api-client/user';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import { ExercisePlayer } from './exercise-player';

const attempt = (
  responseKind: ExerciseView['exercise']['responseKind'],
  overrides: Partial<ExerciseView['exercise']> = {},
): ExerciseView => ({
  id: `attempt-${responseKind}`,
  status: 'PRESENTED',
  presentedAt: '2026-08-05T00:00:00.000Z',
  exercise: {
    id: `exercise-${responseKind}`,
    taskKind: ExerciseTaskKind.FORM_MEANING_MAPPING,
    responseKind,
    responseCardinality: ExerciseResponseCardinality.SINGLE,
    responsePlacement: ExerciseResponsePlacement.BLOCK,
    gradingMode:
      responseKind === ExerciseResponseKind.EXTENDED_TEXT ||
      responseKind === ExerciseResponseKind.NO_CAPTURE
        ? ExerciseGradingMode.SELF_REPORT
        : ExerciseGradingMode.EXACT,
    validationLevel:
      responseKind === ExerciseResponseKind.EXTENDED_TEXT ||
      responseKind === ExerciseResponseKind.NO_CAPTURE
        ? ExerciseValidationLevel.PRACTICE_ONLY
        : ExerciseValidationLevel.FORMATIVE_VERIFIED,
    prompt: { languageTag: 'zh-CN', text: '选择或填写答案' },
    instructions: null,
    maxScore: 1,
    responseConfig: null,
    rubrics:
      responseKind === ExerciseResponseKind.EXTENDED_TEXT
        ? [
            {
              id: 'rubric-default',
              criterionKey: 'target-use',
              languageTag: 'zh-CN',
              description: '目标词符合指定语境。',
              maxScore: 1,
            },
          ]
        : [],
    choices: [],
    stimuli:
      responseKind === ExerciseResponseKind.NO_CAPTURE
        ? [
            {
              roleCode: 'REVEAL',
              stimulusRevision: {
                id: 'stimulus-reveal',
                blocks: [
                  {
                    id: 'block-reveal',
                    position: 0,
                    blockKind: 'TEXT',
                    roleCode: 'REVEAL',
                    languageTag: 'en',
                    text: '/run/',
                  },
                ],
              },
            },
          ]
        : [],
    ...overrides,
  },
});

describe('ExercisePlayer', () => {
  it('EXERCISE-001-COMPONENT submits a single choice using a stable request key', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => ({ correct: true }));
    render(
      <ExercisePlayer
        attempt={attempt(ExerciseResponseKind.CHOICE, {
          choices: [
            { id: 'choice-run', languageTag: 'en', text: 'run' },
            { id: 'choice-walk', languageTag: 'en', text: 'walk' },
          ],
        })}
        onSubmit={onSubmit}
      />,
    );

    const submit = screen.getByRole('button', { name: '提交答案' });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'run' }));
    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledWith(
      'attempt-CHOICE',
      {
        responseKind: ExerciseResponseKind.CHOICE,
        choiceIds: ['choice-run'],
      },
      expect.any(String),
    );
    expect(await screen.findByText('回答正确')).toBeInTheDocument();
  });

  it.each([
    ExerciseResponseKind.SHORT_TEXT,
    ExerciseResponseKind.EXTENDED_TEXT,
  ] as const)(
    'submits a typed %s response only inside configured limits',
    async (responseKind) => {
      const user = userEvent.setup();
      const onSubmit = vi.fn(async () => ({ correct: false }));
      render(
        <ExercisePlayer
          attempt={attempt(responseKind, {
            responseConfig:
              responseKind === ExerciseResponseKind.SHORT_TEXT
                ? {
                    responseKind,
                    caseSensitive: false,
                    diacriticPolicy: ExerciseDiacriticPolicy.PRESERVE,
                    whitespacePolicy: ExerciseWhitespacePolicy.COLLAPSE,
                    capturePolicy: ExerciseCapturePolicy.REQUIRED,
                  }
                : {
                    responseKind,
                    expectedLanguageTag: 'en',
                    minCharacters: 3,
                    maxCharacters: 20,
                    minWords: 1,
                    maxWords: 3,
                    capturePolicy: ExerciseCapturePolicy.OPTIONAL,
                  },
            rubrics:
              responseKind === ExerciseResponseKind.EXTENDED_TEXT
                ? [
                    {
                      id: 'rubric-target-use',
                      criterionKey: 'target-use',
                      languageTag: 'zh-CN',
                      description: '目标词符合指定语境。',
                      maxScore: 1,
                    },
                  ]
                : [],
          })}
          consentRecordId="consent-1"
          onSubmit={onSubmit}
        />,
      );

      const input = screen.getByLabelText(
        responseKind === ExerciseResponseKind.SHORT_TEXT
          ? '单词答案'
          : '句子答案',
      );
      const submit = screen.getByRole('button', { name: '提交答案' });
      await user.type(input, 'go');
      if (responseKind === ExerciseResponseKind.EXTENDED_TEXT) {
        expect(submit).toBeDisabled();
      }
      await user.type(input, 'ing');
      if (responseKind === ExerciseResponseKind.EXTENDED_TEXT) {
        expect(
          screen.queryByText('目标词符合指定语境。'),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '查看评分标准' }));
        expect(screen.getByText('目标词符合指定语境。')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '已完成' }));
      }
      await user.click(submit);

      expect(onSubmit).toHaveBeenCalledWith(
        `attempt-${responseKind}`,
        {
          responseKind,
          text: 'going',
          consentRecordId: 'consent-1',
          ...(responseKind === ExerciseResponseKind.EXTENDED_TEXT
            ? { selfReported: true, revealAcknowledged: true }
            : {}),
        },
        expect.any(String),
      );
    },
  );

  it('submits a no-capture self report without personal content', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => ({ correct: null }));
    render(
      <ExercisePlayer
        attempt={attempt(ExerciseResponseKind.NO_CAPTURE)}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByText('/run/')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看参考' }));
    expect(screen.getByText('/run/')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '需要重练' }));
    await user.click(screen.getByRole('button', { name: '提交答案' }));

    expect(onSubmit).toHaveBeenCalledWith(
      'attempt-NO_CAPTURE',
      {
        responseKind: ExerciseResponseKind.NO_CAPTURE,
        selfReported: false,
        revealAcknowledged: true,
      },
      expect.any(String),
    );
  });

  it('renders top-level and nested audio, video, and image material', () => {
    const { container } = render(
      <ExercisePlayer
        attempt={attempt(ExerciseResponseKind.NO_CAPTURE, {
          stimuli: [
            {
              roleCode: 'PROMPT',
              stimulusRevision: {
                id: 'stimulus-1',
                blocks: [
                  {
                    id: 'block-1',
                    position: 0,
                    blockKind: 'MEDIA',
                    roleCode: 'PROMPT',
                    media: {
                      id: 'audio-1',
                      mediaType: 'AUDIO',
                      mimeType: 'audio/mpeg',
                      contentUri: 'https://cdn.example/audio.mp3',
                    },
                    material: {
                      id: 'material-1',
                      kind: 'PRONUNCIATION_GUIDE',
                      learningLanguageTag: 'en',
                      supportLanguageTag: 'zh-CN',
                      blocks: [
                        {
                          id: 'video-block',
                          position: 0,
                          blockKind: 'MEDIA',
                          roleCode: 'EXPLANATION',
                          media: {
                            id: 'video-1',
                            mediaType: 'VIDEO',
                            mimeType: 'video/mp4',
                            contentUri: 'https://cdn.example/video.mp4',
                          },
                        },
                        {
                          id: 'image-block',
                          position: 1,
                          blockKind: 'MEDIA',
                          roleCode: 'EXPLANATION',
                          media: {
                            id: 'image-1',
                            mediaType: 'IMAGE',
                            mimeType: 'image/webp',
                            contentUri: 'https://cdn.example/image.webp',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        })}
        onSubmit={vi.fn(async () => undefined)}
      />,
    );

    expect(
      container.querySelector('audio[src$="audio.mp3"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('video[src$="video.mp4"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('img[src$="image.webp"]'),
    ).toBeInTheDocument();
  });

  it.each([
    ExerciseResponseKind.CHOICE,
    ExerciseResponseKind.SHORT_TEXT,
    ExerciseResponseKind.EXTENDED_TEXT,
    ExerciseResponseKind.NO_CAPTURE,
  ] as const)(
    'EXERCISE-001-A11Y exposes an accessible %s response surface',
    async (responseKind) => {
      const choices =
        responseKind === ExerciseResponseKind.CHOICE
          ? [{ id: 'choice-run', languageTag: 'en', text: 'run' }]
          : [];
      const { container } = render(
        <ExercisePlayer
          attempt={attempt(responseKind, { choices })}
          consentRecordId="consent-1"
          onSubmit={vi.fn(async () => undefined)}
        />,
      );

      const results = await axe.run(container, {
        rules: { 'color-contrast': { enabled: false } },
      });
      expect(results.violations).toEqual([]);
    },
  );
});
