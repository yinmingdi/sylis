import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';

import WordSpelling from './index';

const meta: Meta<typeof WordSpelling> = {
  title: 'Components/WordSpelling',
  component: WordSpelling,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '单词拼写练习组件，支持实时输入、提示切换、语音播放和拼写检查功能。',
      },
    },
  },
  argTypes: {
    onComplete: {
      action: 'completed',
      description: '拼写完成回调',
    },
    onClose: {
      action: 'close',
      description: '关闭回调',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// 基础示例
export const Default: Story = {
  args: {
    data: {
      word: 'case',
      meaning: '案例，情况',
      phonetic: '/keɪs/',
    },
  },
};

// 短单词
export const ShortWord: Story = {
  args: {
    data: {
      word: 'cat',
      meaning: '猫',
      phonetic: '/kæt/',
    },
  },
};

// 长单词
export const LongWord: Story = {
  args: {
    data: {
      word: 'beautiful',
      meaning: '美丽的',
      phonetic: '/ˈbjuːtɪfl/',
    },
  },
};

// 无音标
export const NoPhonetic: Story = {
  args: {
    data: {
      word: 'hello',
      meaning: '你好',
    },
  },
};

// 带完整回调的示例
export const WithCallbacks: Story = {
  args: {
    data: {
      word: 'example',
      meaning: '例子，示例',
      phonetic: '/ɪɡˈzæmpəl/',
    },
    onComplete: (isCorrect, userInput) => {
      console.log(
        `拼写${isCorrect ? '正确' : '错误'}：用户输入 "${userInput}"`,
      );
    },
    onClose: () => {
      console.log('关闭拼写练习');
    },
  },
};

// 多个单词示例
export const MultipleWords: Story = {
  render: () => {
    const words = [
      { word: 'apple', meaning: '苹果', phonetic: '/ˈæpl/' },
      { word: 'banana', meaning: '香蕉', phonetic: '/bəˈnɑːnə/' },
      { word: 'orange', meaning: '橙子', phonetic: '/ˈɒrɪndʒ/' },
    ];

    const [currentIndex, setCurrentIndex] = React.useState(0);

    const handleComplete = (isCorrect: boolean) => {
      console.log(
        `单词 ${words[currentIndex].word}: ${isCorrect ? '正确' : '错误'}`,
      );
      if (currentIndex < words.length - 1) {
        setTimeout(() => setCurrentIndex(currentIndex + 1), 1000);
      }
    };

    return (
      <WordSpelling
        data={words[currentIndex]}
        onComplete={handleComplete}
        onClose={() => console.log('关闭')}
      />
    );
  },
};
