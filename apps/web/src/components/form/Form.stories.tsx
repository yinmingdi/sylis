import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { AiOutlineUser, AiOutlineMail, AiOutlineLock, AiOutlineBook } from 'react-icons/ai';

import { Form, FormItem, Input, Button, useForm } from '../index';

const meta: Meta<typeof Form> = {
  title: 'UI Components/Form',
  component: Form,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '表单组件，提供完整的表单管理功能，包括数据收集、验证、提交等。专为英语学习应用设计。'
      }
    }
  },
  tags: ['autodocs'],
  argTypes: {
    layout: {
      control: 'select',
      options: ['horizontal', 'vertical', 'inline'],
      description: '表单布局'
    },
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
    gap: {
      control: 'select',
      options: ['small', 'medium', 'large'],
      description: '表单项间距'
    },
    disabled: {
      control: 'boolean',
      description: '禁用整个表单'
    },
    colon: {
      control: 'boolean',
      description: '是否显示冒号'
    }
  }
};

export default meta;
type Story = StoryObj<typeof meta>;

// 基础示例
export const Default: Story = {
  render: () => (
    <Form
      style={{ width: '320px' }}
      onSubmit={(values) => {
        console.log('Form submitted:', values);
        alert(`提交成功: ${JSON.stringify(values, null, 2)}`);
      }}
    >
      <FormItem label="用户名" required>
        <Input name="username" placeholder="请输入用户名" />
      </FormItem>

      <FormItem label="邮箱" required>
        <Input name="email" type="email" placeholder="请输入邮箱" />
      </FormItem>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <Button type="button" variant="secondary">取消</Button>
        <Button type="submit">提交</Button>
      </div>
    </Form>
  )
};

// 布局示例
export const Layouts: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h4 style={{ margin: '0 0 16px 0', color: '#374151' }}>垂直布局</h4>
        <Form layout="vertical" style={{ width: '280px' }}>
          <FormItem label="用户名">
            <Input placeholder="垂直布局" />
          </FormItem>
          <FormItem label="邮箱">
            <Input placeholder="邮箱地址" />
          </FormItem>
        </Form>
      </div>

      <div>
        <h4 style={{ margin: '0 0 16px 0', color: '#374151' }}>水平布局</h4>
        <Form layout="horizontal" labelWidth={80} style={{ width: '400px' }}>
          <FormItem label="用户名">
            <Input placeholder="水平布局" />
          </FormItem>
          <FormItem label="邮箱">
            <Input placeholder="邮箱地址" />
          </FormItem>
        </Form>
      </div>

      <div>
        <h4 style={{ margin: '0 0 16px 0', color: '#374151' }}>内联布局</h4>
        <Form layout="inline" style={{ width: '500px' }}>
          <FormItem label="搜索">
            <Input placeholder="关键词" />
          </FormItem>
          <FormItem label="类型">
            <Input placeholder="类型" />
          </FormItem>
          <FormItem>
            <Button>搜索</Button>
          </FormItem>
        </Form>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '不同的表单布局：垂直、水平、内联。'
      }
    }
  }
};

// 表单验证组件
const FormValidationComponent = () => {
  const form = useForm();

  const handleSubmit = async (values: any) => {
    console.log('Form values:', values);

    // 模拟验证
    if (!values.username) {
      form.setFieldError('username', '用户名不能为空');
      return;
    }
    if (!values.email) {
      form.setFieldError('email', '邮箱不能为空');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(values.email)) {
      form.setFieldError('email', '邮箱格式不正确');
      return;
    }
    if (!values.password) {
      form.setFieldError('password', '密码不能为空');
      return;
    }
    if (values.password.length < 6) {
      form.setFieldError('password', '密码至少6位');
      return;
    }

    alert('验证通过，注册成功！');
  };

  return (
    <Form
      form={form}
      style={{ width: '320px' }}
      onSubmit={handleSubmit}
      onSubmitFailed={(errorInfo) => {
        console.log('Form validation failed:', errorInfo);
      }}
    >
      <FormItem label="用户名" required>
        <Input
          name="username"
          prefix={<AiOutlineUser />}
          placeholder="请输入用户名"
        />
      </FormItem>

      <FormItem label="邮箱" required>
        <Input
          name="email"
          type="email"
          prefix={<AiOutlineMail />}
          placeholder="请输入邮箱地址"
        />
      </FormItem>

      <FormItem label="密码" required>
        <Input
          name="password"
          type="password"
          prefix={<AiOutlineLock />}
          placeholder="至少6位密码"
        />
      </FormItem>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <Button
          type="button"
          variant="secondary"
          onClick={() => form.resetFields()}
        >
          重置
        </Button>
        <Button type="submit">注册</Button>
      </div>
    </Form>
  );
};

export const FormValidation: Story = {
  render: () => <FormValidationComponent />,
  parameters: {
    docs: {
      description: {
        story: '带有验证功能的表单，支持错误提示和重置。'
      }
    }
  }
};

// 受控表单组件
const ControlledFormComponent = () => {
  const form = useForm({
    username: 'john_doe',
    email: 'john@example.com'
  });
  const [formData, setFormData] = useState(form.getFieldsValue());

  const handleValuesChange = (changedValues: any, allValues: any) => {
    setFormData(allValues);
    console.log('Values changed:', changedValues, allValues);
  };

  return (
    <div style={{ display: 'flex', gap: '24px' }}>
      <Form
        form={form}
        style={{ width: '320px' }}
        onValuesChange={handleValuesChange}
        initialValues={{
          username: 'john_doe',
          email: 'john@example.com'
        }}
      >
        <FormItem label="用户名">
          <Input name="username" placeholder="请输入用户名" />
        </FormItem>

        <FormItem label="邮箱">
          <Input name="email" type="email" placeholder="请输入邮箱" />
        </FormItem>

        <FormItem label="学习目标">
          <Input name="goal" placeholder="请输入学习目标" />
        </FormItem>

        <div style={{ display: 'flex', gap: '12px' }}>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              form.setFieldsValue({
                username: 'new_user',
                email: 'new@example.com',
                goal: '通过四级考试'
              });
            }}
          >
            填充数据
          </Button>
          <Button type="submit">提交</Button>
        </div>
      </Form>

      <div style={{
        padding: '16px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        minWidth: '200px',
        fontSize: '14px',
        fontFamily: 'monospace'
      }}>
        <h5 style={{ margin: '0 0 12px 0' }}>当前表单值:</h5>
        <pre style={{ margin: 0, fontSize: '12px' }}>
          {JSON.stringify(formData, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export const ControlledForm: Story = {
  render: () => <ControlledFormComponent />,
  parameters: {
    docs: {
      description: {
        story: '受控表单示例，展示如何监听和控制表单数据。'
      }
    }
  }
};

// 表单间距
export const FormSpacing: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '32px' }}>
      <div>
        <h4 style={{ margin: '0 0 16px 0', color: '#374151' }}>紧凑间距</h4>
        <Form gap="small" style={{ width: '250px' }}>
          <FormItem label="字段1">
            <Input placeholder="紧凑间距" />
          </FormItem>
          <FormItem label="字段2">
            <Input placeholder="紧凑间距" />
          </FormItem>
          <FormItem label="字段3">
            <Input placeholder="紧凑间距" />
          </FormItem>
        </Form>
      </div>

      <div>
        <h4 style={{ margin: '0 0 16px 0', color: '#374151' }}>默认间距</h4>
        <Form gap="medium" style={{ width: '250px' }}>
          <FormItem label="字段1">
            <Input placeholder="默认间距" />
          </FormItem>
          <FormItem label="字段2">
            <Input placeholder="默认间距" />
          </FormItem>
          <FormItem label="字段3">
            <Input placeholder="默认间距" />
          </FormItem>
        </Form>
      </div>

      <div>
        <h4 style={{ margin: '0 0 16px 0', color: '#374151' }}>宽松间距</h4>
        <Form gap="large" style={{ width: '250px' }}>
          <FormItem label="字段1">
            <Input placeholder="宽松间距" />
          </FormItem>
          <FormItem label="字段2">
            <Input placeholder="宽松间距" />
          </FormItem>
          <FormItem label="字段3">
            <Input placeholder="宽松间距" />
          </FormItem>
        </Form>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '不同的表单间距设置：紧凑、默认、宽松。'
      }
    }
  }
};

// 学习应用场景
export const LearningAppScenarios: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
      {/* 用户注册表单 */}
      <div>
        <h3 style={{ margin: '0 0 20px 0', color: '#1f2937' }}>用户注册</h3>
        <Form style={{ width: '360px' }}>
          <FormItem
            label="邮箱地址"
            required
            helperText="将作为您的登录账号"
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

          <FormItem
            label="登录密码"
            required
            helperText="至少8位，包含字母和数字"
          >
            <Input
              type="password"
              prefix={<AiOutlineLock />}
              placeholder="请输入密码"
            />
          </FormItem>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
            <Button variant="secondary">返回登录</Button>
            <Button type="submit">立即注册</Button>
          </div>
        </Form>
      </div>

      {/* 学习计划设置 */}
      <div>
        <h3 style={{ margin: '0 0 20px 0', color: '#1f2937' }}>学习计划设置</h3>
        <Form layout="horizontal" labelWidth={120} style={{ width: '480px' }}>
          <FormItem
            label="每日目标"
            helperText="建议从较小目标开始"
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Input type="number" placeholder="30" style={{ width: '80px' }} />
              <span style={{ color: '#6b7280' }}>分钟</span>
            </div>
          </FormItem>

          <FormItem
            label="学习科目"
            extra="可以随时调整学习重点"
          >
            <Input
              prefix={<AiOutlineBook />}
              placeholder="如：词汇、语法、听力"
            />
          </FormItem>

          <FormItem
            label="提醒时间"
          >
            <Input type="time" defaultValue="09:00" />
          </FormItem>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
            <Button variant="secondary">跳过设置</Button>
            <Button type="submit">保存计划</Button>
          </div>
        </Form>
      </div>

      {/* 快速搜索表单 */}
      <div>
        <h3 style={{ margin: '0 0 20px 0', color: '#1f2937' }}>学习资源搜索</h3>
        <Form layout="inline" style={{ width: '600px' }}>
          <FormItem label="关键词">
            <Input placeholder="搜索单词、短语..." allowClear />
          </FormItem>

          <FormItem label="难度">
            <Input placeholder="初级" style={{ width: '100px' }} />
          </FormItem>

          <FormItem>
            <Button type="submit">搜索</Button>
          </FormItem>

          <FormItem>
            <Button variant="outline">高级搜索</Button>
          </FormItem>
        </Form>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: '英语学习应用中的典型表单使用场景。'
      }
    }
  }
};
