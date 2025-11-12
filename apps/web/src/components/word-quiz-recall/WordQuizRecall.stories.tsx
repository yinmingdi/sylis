import type { Meta, StoryObj } from '@storybook/react';

import WordQuizRecall, {
  type WordQuizRecallData,
  type WordMeaning,
} from './WordQuizRecall';

const meta: Meta<typeof WordQuizRecall> = {
  title: 'Components/WordQuizRecall',
  component: WordQuizRecall,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '单词回忆测验组件，显示词性和释义，让用户回忆并判断是否认识该单词。',
      },
    },
  },
  argTypes: {
    currentVoice: {
      control: { type: 'select' },
      options: ['us', 'uk'],
      description: '语音类型（美音/英音）',
    },
    showHint: {
      control: { type: 'boolean' },
      description: '是否显示提示',
    },
    onPlayPronunciation: {
      action: 'playPronunciation',
      description: '播放发音回调函数',
    },
    onToggleHint: {
      action: 'toggleHint',
      description: '切换提示显示回调函数',
    },
    onKnowWord: {
      action: 'knowWord',
      description: '认识/模糊/不认识单词回调函数',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// 基础示例
export const Default: Story = {
  args: {
    word: {
      headword: 'abandon',
      usPhonetic: '/əˈbændən/',
      ukPhonetic: '/əˈbændən/',
    } as WordQuizRecallData,
    currentVoice: 'us',
    showHint: false,
    meanings: [
      {
        partOfSpeech: 'v.',
        meaningCn: '放弃；抛弃；离弃',
      },
      {
        partOfSpeech: 'n.',
        meaningCn: '放任；纵情',
      },
    ] as WordMeaning[],
  },
};

// 多个词性
export const MultipleMeanings: Story = {
  args: {
    word: {
      headword: 'present',
      usPhonetic: '/ˈpreznt/',
      ukPhonetic: '/ˈpreznt/',
    } as WordQuizRecallData,
    currentVoice: 'us',
    showHint: false,
    meanings: [
      {
        partOfSpeech: 'n.',
        meaningCn: '礼物；现在',
      },
      {
        partOfSpeech: 'adj.',
        meaningCn: '现在的；出席的',
      },
      {
        partOfSpeech: 'v.',
        meaningCn: '呈现；介绍；赠送',
      },
    ] as WordMeaning[],
  },
};

// 形容词
export const Adjective: Story = {
  args: {
    word: {
      headword: 'beautiful',
      usPhonetic: '/ˈbjuːtɪfl/',
      ukPhonetic: '/ˈbjuːtɪfl/',
    } as WordQuizRecallData,
    currentVoice: 'us',
    showHint: false,
    meanings: [
      {
        partOfSpeech: 'adj.',
        meaningCn: '美丽的；漂亮的；出色的',
      },
    ] as WordMeaning[],
  },
};

// 英音模式
export const UKVoice: Story = {
  args: {
    word: {
      headword: 'comprehensive',
      usPhonetic: '/ˌkɑːmprɪˈhensɪv/',
      ukPhonetic: '/ˌkɒmprɪˈhensɪv/',
    } as WordQuizRecallData,
    currentVoice: 'uk',
    showHint: false,
    meanings: [
      {
        partOfSpeech: 'adj.',
        meaningCn: '综合的；全面的；详尽的；广泛的',
      },
    ] as WordMeaning[],
  },
};

// 名词
export const Noun: Story = {
  args: {
    word: {
      headword: 'challenge',
      usPhonetic: '/ˈtʃælɪndʒ/',
      ukPhonetic: '/ˈtʃælɪndʒ/',
    } as WordQuizRecallData,
    currentVoice: 'us',
    showHint: false,
    meanings: [
      {
        partOfSpeech: 'n.',
        meaningCn: '挑战；质疑；艰巨的任务',
      },
      {
        partOfSpeech: 'v.',
        meaningCn: '挑战；质疑；向...提出挑战',
      },
    ] as WordMeaning[],
  },
};

// 长释义
export const LongDefinition: Story = {
  args: {
    word: {
      headword: 'extraordinary',
      usPhonetic: '/ɪkˈstrɔːrdəneri/',
      ukPhonetic: '/ɪkˈstrɔːdənri/',
    } as WordQuizRecallData,
    currentVoice: 'us',
    showHint: false,
    meanings: [
      {
        partOfSpeech: 'adj.',
        meaningCn:
          '非凡的；特别的；离奇的；特派的；非凡的；特别的；离奇的；特派的',
      },
    ] as WordMeaning[],
  },
};

// 动词
export const Verb: Story = {
  args: {
    word: {
      headword: 'achieve',
      usPhonetic: '/əˈtʃiːv/',
      ukPhonetic: '/əˈtʃiːv/',
    } as WordQuizRecallData,
    currentVoice: 'us',
    showHint: false,
    meanings: [
      {
        partOfSpeech: 'v.',
        meaningCn: '实现；达到；完成',
      },
    ] as WordMeaning[],
  },
};

