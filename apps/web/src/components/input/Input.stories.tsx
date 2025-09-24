/* eslint-disable react-hooks/rules-of-hooks */
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { AiOutlineUser, AiOutlineMail, AiOutlineSearch, AiOutlineLock } from 'react-icons/ai';

import { Input } from './index';

const meta: Meta<typeof Input> = {
  title: 'UI Components/Input',
  component: Input,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '输入框组件，支持多种类型、状态和功能。专为英语学习应用设计，具有良好的用户体验。'
      }
    }
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
      description: '输入框尺寸'
    },
    status: {
      control: 'select',
      options: ['default', 'error', 'warning', 'success'],
      description: '输入框状态'
    },
    type: {
      control: 'select',
      options: ['text', 'password', 'email', 'number', 'search', 'tel', 'url'],
      description: '输入框类型'
    },
    disabled: {
      control: 'boolean',
      description: '禁用状态'
    },
    allowClear: {
      control: 'boolean',
      description: '显示清除按钮'
    },
    showCount: {
      control: 'boolean',
      description: '显示字符计数'
    },
    required: {
      control: 'boolean',
      description: '必填字段'
    }
  },
  args: {
    placeholder: '请输入内容'
  }
};

export default meta;
type Story = StoryObj<typeof meta>;

// 基础示例
export const Default: Story = {
  args: {
    label: '用户名',
    placeholder: '请输入用户名'
  }
};

// 尺寸示例
export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '280px' }}>
      <Input label="小尺寸" size="small" placeholder="小尺寸输入框" />
      <Input label="中等尺寸" size="medium" placeholder="中等尺寸输入框" />
      <Input label="大尺寸" size="large" placeholder="大尺寸输入框" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '不同尺寸的输入框，适配不同的界面需求。'
      }
    }
  }
};

// 状态示例
export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '280px' }}>
      <Input label="默认状态" placeholder="默认状态" />
      <Input label="错误状态" status="error" error="请输入有效的邮箱地址" placeholder="错误状态" />
      <Input label="警告状态" status="warning" helperText="建议使用更强的密码" placeholder="警告状态" />
      <Input label="成功状态" status="success" helperText="验证通过" placeholder="成功状态" />
      <Input label="禁用状态" disabled placeholder="禁用状态" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '输入框的不同状态：默认、错误、警告、成功、禁用。'
      }
    }
  }
};

// 带图标的输入框
export const WithIcons: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '280px' }}>
      <Input
        label="用户名"
        prefix={<AiOutlineUser />}
        placeholder="请输入用户名"
      />
      <Input
        label="邮箱"
        prefix={<AiOutlineMail />}
        type="email"
        placeholder="请输入邮箱地址"
      />
      <Input
        label="搜索"
        prefix={<AiOutlineSearch />}
        allowClear
        placeholder="搜索单词或短语"
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '带有前缀图标的输入框，提升用户体验。'
      }
    }
  }
};

// 密码输入框
export const PasswordInput: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '280px' }}>
      <Input
        label="密码"
        type="password"
        prefix={<AiOutlineLock />}
        placeholder="请输入密码"
        required
      />
      <Input
        label="确认密码"
        type="password"
        prefix={<AiOutlineLock />}
        placeholder="请再次输入密码"
        required
        helperText="密码需要包含字母和数字"
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '密码输入框，自动提供密码可见性切换功能。'
      }
    }
  }
};

// 功能示例
export const Features: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '280px' }}>
      <Input
        label="带清除功能"
        allowClear
        placeholder="可以清除内容"
        defaultValue="默认内容"
      />
      <Input
        label="字符计数"
        showCount
        maxLength={50}
        placeholder="最多输入50个字符"
        helperText="请简要描述您的学习目标"
      />
      <Input
        label="必填字段"
        required
        placeholder="此字段为必填"
        error="此字段不能为空"
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '输入框的各种功能：清除、字符计数、必填验证。'
      }
    }
  }
};

// 受控组件示例
export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState('');
    const [searchValue, setSearchValue] = useState('');

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '280px' }}>
        <Input
          label="受控输入"
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
          placeholder="受控组件"
          helperText={`当前值: ${value}`}
        />
        <Input
          label="搜索框"
          prefix={<AiOutlineSearch />}
          value={searchValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchValue(e.target.value)}
          allowClear
          onClear={() => setSearchValue('')}
          placeholder="搜索内容"
          helperText={searchValue ? `搜索: "${searchValue}"` : '开始输入进行搜索'}
        />
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: '受控组件示例，展示如何管理输入框的状态。'
      }
    }
  }
};

// 学习应用场景
export const LearningAppScenarios: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '320px' }}>
      <div>
        <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>用户注册</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Input
            label="邮箱"
            type="email"
            prefix={<AiOutlineMail />}
            placeholder="your@email.com"
            required
          />
          <Input
            label="密码"
            type="password"
            prefix={<AiOutlineLock />}
            placeholder="至少8位密码"
            required
            showCount
            maxLength={128}
          />
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>学习搜索</h4>
        <Input
          label="单词搜索"
          prefix={<AiOutlineSearch />}
          placeholder="搜索单词、短语或句子"
          allowClear
          helperText="支持中英文搜索"
        />
      </div>

      <div>
        <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>学习笔记</h4>
        <Input
          label="学习笔记"
          placeholder="记录学习心得..."
          showCount
          maxLength={200}
          helperText="记录您的学习感悟和疑问"
        />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '英语学习应用中的典型输入框使用场景。'
      }
    }
  }
};
