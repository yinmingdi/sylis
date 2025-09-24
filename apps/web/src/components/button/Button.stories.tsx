import type { Meta, StoryObj } from '@storybook/react';
import { AiOutlineDownload, AiOutlinePlus, AiOutlineHeart, AiOutlineArrowRight } from 'react-icons/ai';

import { Button } from './index';

const meta: Meta<typeof Button> = {
  title: 'UI Components/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '按钮组件，支持多种样式变体、尺寸和状态。符合英语学习应用的设计规范。'
      }
    }
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline', 'ghost', 'danger'],
      description: '按钮样式变体'
    },
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
      description: '按钮尺寸'
    },
    shape: {
      control: 'select',
      options: ['default', 'round', 'circle'],
      description: '按钮形状'
    },
    loading: {
      control: 'boolean',
      description: '加载状态'
    },
    disabled: {
      control: 'boolean',
      description: '禁用状态'
    },
    block: {
      control: 'boolean',
      description: '块级按钮'
    },
    children: {
      control: 'text',
      description: '按钮文本内容'
    }
  },
  args: {
    children: '按钮'
  }
};

export default meta;
type Story = StoryObj<typeof meta>;

// 基础示例
export const Default: Story = {
  args: {
    children: '开始学习'
  }
};

// 变体示例
export const Variants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
      <Button variant="primary">主要按钮</Button>
      <Button variant="secondary">次要按钮</Button>
      <Button variant="outline">轮廓按钮</Button>
      <Button variant="ghost">幽灵按钮</Button>
      <Button variant="danger">危险按钮</Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '不同的按钮变体，适用于不同的场景。'
      }
    }
  }
};

// 尺寸示例
export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
      <Button size="small">小按钮</Button>
      <Button size="medium">中等按钮</Button>
      <Button size="large">大按钮</Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '不同尺寸的按钮，适配不同的界面空间。'
      }
    }
  }
};

// 形状示例
export const Shapes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
      <Button shape="default">默认形状</Button>
      <Button shape="round">圆角按钮</Button>
      <Button shape="circle" icon={<AiOutlinePlus />} />
      <Button shape="circle" size="small" icon={<AiOutlineHeart />} />
      <Button shape="circle" size="large" icon={<AiOutlineDownload />} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '不同形状的按钮，包括圆形图标按钮。'
      }
    }
  }
};

// 带图标的按钮
export const WithIcons: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
      <Button icon={<AiOutlinePlus />}>添加单词</Button>
      <Button icon={<AiOutlineDownload />} variant="secondary">下载课程</Button>
      <Button iconRight={<AiOutlineArrowRight />} variant="outline">继续学习</Button>
      <Button icon={<AiOutlineHeart />} variant="ghost" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '带有图标的按钮，可以放置在左侧或右侧。'
      }
    }
  }
};

// 状态示例
export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
      <Button>正常状态</Button>
      <Button loading>加载中...</Button>
      <Button disabled>禁用状态</Button>
      <Button loading disabled>加载禁用</Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '按钮的不同状态：正常、加载中、禁用等。'
      }
    }
  }
};

// 块级按钮
export const Block: Story = {
  render: () => (
    <div style={{ width: '300px' }}>
      <Button block>完整宽度按钮</Button>
      <br /><br />
      <Button block variant="secondary" icon={<AiOutlinePlus />}>
        添加到学习计划
      </Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '块级按钮占据容器的完整宽度。'
      }
    }
  }
};

// 学习应用场景
export const LearningAppScenarios: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '320px' }}>
      <div>
        <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>课程操作</h4>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Button icon={<AiOutlinePlus />}>开始学习</Button>
          <Button variant="secondary">预习课程</Button>
          <Button variant="outline" size="small">收藏</Button>
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>学习进度</h4>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Button variant="primary" iconRight={<AiOutlineArrowRight />}>
            继续学习
          </Button>
          <Button variant="ghost">跳过</Button>
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>用户操作</h4>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Button block loading>正在保存进度...</Button>
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '英语学习应用中的典型使用场景。'
      }
    }
  }
};
