import type { Meta, StoryObj } from '@storybook/react';
import { AiOutlineUser, AiOutlineMail, AiOutlineInfo } from 'react-icons/ai';

import { FormItem } from './index';
import { Button } from '../button';
import { Input } from '../input';

const meta: Meta<typeof FormItem> = {
  title: 'UI Components/FormItem',
  component: FormItem,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '表单项组件，为表单控件提供标签、错误信息、帮助文本等统一的布局和样式。'
      }
    }
  },
  tags: ['autodocs'],
  argTypes: {
    labelPosition: {
      control: 'select',
      options: ['top', 'left', 'right'],
      description: '标签位置'
    },
    labelAlign: {
      control: 'select',
      options: ['left', 'center', 'right'],
      description: '标签对齐方式'
    },
    status: {
      control: 'select',
      options: ['default', 'error', 'warning', 'success', 'validating'],
      description: '验证状态'
    },
    required: {
      control: 'boolean',
      description: '是否必填'
    },
    colon: {
      control: 'boolean',
      description: '是否显示冒号'
    }
  },
  args: {
    label: '字段标签',
    children: <Input placeholder="请输入内容" />
  }
};

export default meta;
type Story = StoryObj<typeof meta>;

// 基础示例
export const Default: Story = {
  args: {
    label: '用户名',
    children: <Input placeholder="请输入用户名" />
  }
};

// 标签位置
export const LabelPositions: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '400px' }}>
      <FormItem label="顶部标签" labelPosition="top">
        <Input placeholder="标签在顶部" />
      </FormItem>

      <FormItem label="左侧标签" labelPosition="left" labelWidth={100}>
        <Input placeholder="标签在左侧" />
      </FormItem>

      <FormItem label="右侧标签" labelPosition="right" labelWidth={100}>
        <Input placeholder="标签在右侧" />
      </FormItem>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '不同的标签位置：顶部、左侧、右侧。'
      }
    }
  }
};

// 标签对齐
export const LabelAlignment: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '400px' }}>
      <FormItem label="左对齐" labelPosition="left" labelAlign="left" labelWidth={120}>
        <Input placeholder="标签左对齐" />
      </FormItem>

      <FormItem label="居中" labelPosition="left" labelAlign="center" labelWidth={120}>
        <Input placeholder="标签居中对齐" />
      </FormItem>

      <FormItem label="右对齐" labelPosition="left" labelAlign="right" labelWidth={120}>
        <Input placeholder="标签右对齐" />
      </FormItem>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '标签的不同对齐方式：左对齐、居中、右对齐。'
      }
    }
  }
};

// 验证状态
export const ValidationStates: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '300px' }}>
      <FormItem label="默认状态" status="default">
        <Input placeholder="默认状态" />
      </FormItem>

      <FormItem
        label="错误状态"
        status="error"
        error="请输入有效的邮箱地址"
      >
        <Input placeholder="输入邮箱" status="error" />
      </FormItem>

      <FormItem
        label="警告状态"
        status="warning"
        helperText="建议使用更强的密码"
      >
        <Input placeholder="输入密码" status="warning" />
      </FormItem>

      <FormItem
        label="成功状态"
        status="success"
        helperText="验证通过"
      >
        <Input placeholder="验证成功" status="success" />
      </FormItem>

      <FormItem
        label="验证中"
        status="validating"
        helperText="正在验证用户名..."
      >
        <Input placeholder="验证中" />
      </FormItem>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '不同的验证状态：默认、错误、警告、成功、验证中。'
      }
    }
  }
};

// 必填和帮助信息
export const RequiredAndHelp: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '300px' }}>
      <FormItem
        label="用户名"
        required
        helperText="用户名将作为您的学习档案标识"
      >
        <Input placeholder="请输入用户名" />
      </FormItem>

      <FormItem
        label="邮箱"
        required
        error="邮箱格式不正确"
        extra="我们将向此邮箱发送学习报告"
      >
        <Input placeholder="请输入邮箱" status="error" />
      </FormItem>

      <FormItem
        label="学习目标"
        helperText="简要描述您的英语学习目标"
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6b7280', fontSize: '12px' }}>
            <AiOutlineInfo size={14} />
            <span>此信息有助于为您推荐合适的课程</span>
          </div>
        }
      >
        <Input placeholder="例如：通过四级考试" />
      </FormItem>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '必填标识、帮助文本和额外说明的使用。'
      }
    }
  }
};

// 不同控件类型
export const DifferentControls: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '300px' }}>
      <FormItem label="文本输入">
        <Input placeholder="普通文本输入" />
      </FormItem>

      <FormItem label="密码输入">
        <Input type="password" placeholder="请输入密码" />
      </FormItem>

      <FormItem label="搜索输入">
        <Input
          type="search"
          prefix={<AiOutlineUser />}
          placeholder="搜索用户"
          allowClear
        />
      </FormItem>

      <FormItem label="操作按钮">
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="primary">保存</Button>
          <Button variant="secondary">取消</Button>
        </div>
      </FormItem>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'FormItem 可以包装不同类型的表单控件。'
      }
    }
  }
};

// 学习应用场景
export const LearningAppScenarios: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '360px' }}>
      <div>
        <h4 style={{ margin: '0 0 16px 0', color: '#374151' }}>用户注册表单</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormItem
            label="邮箱地址"
            required
            helperText="作为登录账号使用"
          >
            <Input
              type="email"
              prefix={<AiOutlineMail />}
              placeholder="your@email.com"
            />
          </FormItem>

          <FormItem
            label="用户昵称"
            required
            extra="昵称将在学习社区中显示"
          >
            <Input
              prefix={<AiOutlineUser />}
              placeholder="请输入昵称"
              showCount
              maxLength={20}
            />
          </FormItem>
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 16px 0', color: '#374151' }}>学习偏好设置</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormItem
            label="每日学习目标"
            labelPosition="left"
            labelWidth={120}
            helperText="建议从较小的目标开始"
          >
            <Input
              type="number"
              placeholder="30"
              suffix="分钟"
            />
          </FormItem>

          <FormItem
            label="学习提醒"
            labelPosition="left"
            labelWidth={120}
            status="success"
            helperText="已开启每日学习提醒"
          >
            <Button variant="outline" size="small">
              修改提醒时间
            </Button>
          </FormItem>
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '英语学习应用中的典型表单项使用场景。'
      }
    }
  }
};
