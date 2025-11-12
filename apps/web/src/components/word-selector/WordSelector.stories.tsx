import type { Meta, StoryObj } from '@storybook/react';

import { WordSelector } from './index';

const meta: Meta<typeof WordSelector> = {
  title: 'UI Components/WordSelector',
  component: WordSelector,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: '基于 Slate.js 的单词选择器组件，支持 @ 符号触发单词建议。'
      }
    }
  },
  tags: ['autodocs'],
  args: {
    placeholder: '输入文本，使用 @ 选择单词...',
    triggerChar: '@',
    maxSuggestions: 5
  }
};

export default meta;
type Story = StoryObj<typeof meta>;

// 最简单示例
export const Default: Story = {};
