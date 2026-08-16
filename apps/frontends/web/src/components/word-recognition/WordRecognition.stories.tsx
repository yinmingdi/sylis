import NiceModal from '@ebay/nice-modal-react';
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';

import WordRecognition, { type WordData } from './WordRecognition';

const meta: Meta<typeof WordRecognition> = {
  title: 'Components/WordRecognition',
  component: WordRecognition,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '单词识别组件，用于学习模式。显示单词、音标和例句，支持切换提示和语音类型。',
      },
    },
  },
  decorators: [
    (Story) => (
      <NiceModal.Provider>
        <Story />
      </NiceModal.Provider>
    ),
  ],
  argTypes: {
    currentVoice: {
      control: { type: 'select' },
      options: ['us', 'uk'],
      description: '语音类型（美音/英音）',
    },
    showHint: {
      control: { type: 'boolean' },
      description: '是否显示例句提示',
    },
    onPlayPronunciation: {
      action: 'playPronunciation',
      description: '播放发音回调函数',
    },
    onVoiceToggle: {
      action: 'voiceToggle',
      description: '切换语音类型回调函数',
    },
    onToggleHint: {
      action: 'toggleHint',
      description: '切换提示显示回调函数',
    },
    onKnowWord: {
      action: 'knowWord',
      description: '认识/不认识单词回调函数',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// 基础学习模式示例
export const Default: Story = {
  args: {
    word: {
      headword: 'abandon',
      usPhonetic: '/əˈbændən/',
      ukPhonetic: '/əˈbændən/',
      exampleSentences: [
        {
          sentenceEn:
            'They had to abandon the car and walk the rest of the way.',
          sentenceCn: '他们不得不弃车，步行剩下的路程。',
        },
      ],
    } as WordData,
    currentVoice: 'us',
    showHint: false,
  },
};

// 显示例句的学习模式
export const WithExample: Story = {
  args: {
    word: {
      headword: 'achieve',
      usPhonetic: '/əˈtʃiːv/',
      ukPhonetic: '/əˈtʃiːv/',
      exampleSentences: [
        {
          sentenceEn: 'She achieved her goal of becoming a doctor.',
          sentenceCn: '她实现了成为医生的目标。',
        },
      ],
    } as WordData,
    currentVoice: 'us',
    showHint: true,
  },
};

// 英音模式
export const UKVoice: Story = {
  args: {
    word: {
      headword: 'comprehensive',
      usPhonetic: '/ˌkɑːmprɪˈhensɪv/',
      ukPhonetic: '/ˌkɒmprɪˈhensɪv/',
      exampleSentences: [
        {
          sentenceEn: 'We need a comprehensive solution to this problem.',
          sentenceCn: '我们需要一个全面的解决方案。',
        },
      ],
    } as WordData,
    currentVoice: 'uk',
    showHint: false,
  },
};

// 无音标的学习模式
export const NoPhonetic: Story = {
  args: {
    word: {
      headword: 'hello',
      exampleSentences: [
        {
          sentenceEn: 'Hello, how are you?',
          sentenceCn: '你好，你好吗？',
        },
      ],
    } as WordData,
    currentVoice: 'us',
    showHint: true,
  },
};

// 无例句的学习模式
export const NoExample: Story = {
  args: {
    word: {
      headword: 'example',
      usPhonetic: '/ɪɡˈzæmpəl/',
      ukPhonetic: '/ɪɡˈzɑːmpəl/',
    } as WordData,
    currentVoice: 'us',
    showHint: false,
  },
};

// 带完整回调的示例
export const WithCallbacks: Story = {
  args: {
    word: {
      headword: 'challenge',
      usPhonetic: '/ˈtʃælɪndʒ/',
      ukPhonetic: '/ˈtʃælɪndʒ/',
      exampleSentences: [
        {
          sentenceEn: 'This is a great challenge for us.',
          sentenceCn: '这对我们来说是一个巨大的挑战。',
        },
      ],
    } as WordData,
    currentVoice: 'us',
    showHint: false,
    onPlayPronunciation: () => {
      console.log('播放单词发音');
    },
    onVoiceToggle: () => {
      console.log('切换语音类型');
    },
    onToggleHint: () => {
      console.log('切换提示显示');
    },
    onKnowWord: (known: boolean) => {
      console.log(`单词${known ? '认识' : '不认识'}`);
    },
  },
};

// 交互式示例：切换提示
export const InteractiveHintToggle: Story = {
  render: () => {
    const [showHint, setShowHint] = useState(false);

    const word: WordData = {
      headword: 'comprehensive',
      usPhonetic: '/ˌkɑːmprɪˈhensɪv/',
      ukPhonetic: '/ˌkɒmprɪˈhensɪv/',
      exampleSentences: [
        {
          sentenceEn: 'We need a comprehensive solution to this problem.',
          sentenceCn: '我们需要一个全面的解决方案。',
        },
      ],
    };

    return (
      <div>
        <div
          style={{
            padding: '16px',
            background: '#f5f5f5',
            borderBottom: '1px solid #e0e0e0',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <button
            onClick={() => setShowHint(!showHint)}
            style={{
              padding: '8px 16px',
              backgroundColor: showHint ? '#06d6a0' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            {showHint ? '隐藏' : '显示'}例句
          </button>
        </div>
        <WordRecognition
          word={word}
          currentVoice="us"
          showHint={showHint}
          onPlayPronunciation={() => console.log('播放发音')}
          onVoiceToggle={() => console.log('切换语音')}
          onToggleHint={() => setShowHint(!showHint)}
          onKnowWord={(known) =>
            console.log(`单词${known ? '认识' : '不认识'}`)
          }
        />
      </div>
    );
  },
};
