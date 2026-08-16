import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import WordDetail from './WordDetail';
import WordRecognition from '../word-recognition';

const detail = {
  id: 'word-bank',
  headword: 'bank',
  usPhonetic: 'baenk',
  ukPhonetic: 'bank',
  meanings: [
    {
      partOfSpeech: 'noun',
      meaningCn: '银行；河岸',
      meaningEn: 'An organization that keeps and lends money.',
    },
  ],
  exampleSentences: [
    {
      id: 'example-1',
      sentenceEn: 'She went to the bank.',
      sentenceCn: '她去了银行。',
      headword: 'bank',
      source: 'AI' as const,
    },
  ],
  examTags: ['CET4'],
  realExamSentences: [],
  phrases: [
    {
      id: 'phrase-1',
      phraseText: 'bank account',
      phraseCn: '银行账户',
    },
  ],
  synonyms: [
    {
      id: 'synonym-1',
      partOfSpeech: 'noun',
      meaningCn: '金融机构',
      synonymText: 'financial institution',
    },
  ],
  wordRelations: [
    {
      id: 'relation-1',
      relatedWord: 'banker',
      meaningCn: '银行家',
      pos: 'DERIVATION',
    },
  ],
};

describe('legacy vocabulary presentation', () => {
  it('keeps meanings as the first detail tab and preserves all legacy sections', async () => {
    const user = userEvent.setup();
    render(<WordDetail data={detail} />);

    expect(
      screen.getByText('An organization that keeps and lends money.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '释义' }).className).toContain(
      'tabButtonActive',
    );

    await user.click(screen.getByRole('button', { name: '例句' }));
    expect(
      screen.getByText('She', { selector: '[data-word="she"]' }).closest('p'),
    ).toHaveTextContent('She went to the bank.');
    expect(screen.getByText('AI 生成')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '词组搭配' }));
    expect(
      screen
        .getByText('account', { selector: '[data-word="account"]' })
        .closest('p'),
    ).toHaveTextContent('bank account');

    await user.click(screen.getByRole('button', { name: '近义' }));
    expect(
      screen
        .getByText('financial', { selector: '[data-word="financial"]' })
        .closest('p'),
    ).toHaveTextContent('financial institution');

    await user.click(screen.getByRole('button', { name: '派生' }));
    expect(screen.getByText('banker')).toBeVisible();
  });

  it('shows part-of-speech meanings before the example in the recitation hint', () => {
    render(
      <WordRecognition
        word={detail}
        currentVoice="us"
        showHint
        onPlayPronunciation={vi.fn()}
        onVoiceToggle={vi.fn()}
        onToggleHint={vi.fn()}
        onKnowWord={vi.fn()}
      />,
    );

    expect(screen.getByText('释义')).toBeVisible();
    expect(screen.getByText('noun.')).toBeVisible();
    expect(screen.getByText('银行；河岸')).toBeVisible();
    expect(screen.getByText('例句')).toBeVisible();
    expect(
      screen.getByText('She', { selector: '[data-word="she"]' }).closest('p'),
    ).toHaveTextContent('She went to the bank.');
  });
});
