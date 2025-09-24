import { emailRegExp } from '@sylis/utils';
import React from 'react';
import { Link } from 'react-router-dom';

import { Form, FormItem, Input, Button, useForm } from '../../components';
import { useLogin } from './hooks/useLogin';
import styles from './index.module.less';

// 表单验证函数
const validateEmail = (email: string): string | undefined => {
  if (!email) return '请输入邮箱地址';
  if (!emailRegExp.test(email)) return '邮箱格式不正确';
  return undefined;
};

const validatePassword = (password: string): string | undefined => {
  if (!password) return '请输入密码';
  if (password.length < 6) return '密码长度不能少于6位';
  return undefined;
};

/**
 * 登录页面组件 - 简洁现代设计
 * 参考register页面的设计风格，提供一致的用户体验
 */
const Login: React.FC = () => {
  const form = useForm();
  const { loading, error, handleLogin, clearError } = useLogin();

  // 表单字段变化处理
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    form.setFieldValue('email', value);

    // 清除错误
    if (form.getFieldError('email')) {
      form.setFieldError('email', '');
    }
    clearError();
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    form.setFieldValue('password', value);

    // 清除错误
    if (form.getFieldError('password')) {
      form.setFieldError('password', '');
    }
    clearError();
  };

  // 表单验证
  const validateForm = (): boolean => {
    const values = form.getFieldsValue();
    const errors: Record<string, string> = {};

    const emailError = validateEmail(values.email);
    if (emailError) errors.email = emailError;

    const passwordError = validatePassword(values.password);
    if (passwordError) errors.password = passwordError;

    // 设置错误
    form.setFieldsError(errors);

    return Object.keys(errors).length === 0;
  };

  // 登录提交
  const handleFinish = async (values: any) => {
    if (!validateForm()) {
      return;
    }

    await handleLogin({
      email: values.email,
      password: values.password,
    });
  };

  return (
    <div className={styles.loginPage}>
      <div className={styles.content}>
        <div className={styles.hero}>
          <h1>欢迎回来</h1>
          <p>继续您的英语学习旅程</p>
        </div>

        <Form
          form={form}
          layout="vertical"
          onSubmit={handleFinish}
          className={styles.form}
        >
          <FormItem
            label="邮箱地址"
            required
            error={form.getFieldError('email')}
          >
            <Input
              name="email"
              placeholder="请输入邮箱地址"
              type="email"
              allowClear
              className={styles.formInput}
              value={form.getFieldValue('email') || ''}
              onChange={handleEmailChange}
              disabled={loading}
            />
          </FormItem>

          <FormItem
            label="密码"
            required
            error={form.getFieldError('password')}
          >
            <Input
              name="password"
              placeholder="请输入密码"
              type="password"
              allowClear
              className={styles.formInput}
              value={form.getFieldValue('password') || ''}
              onChange={handlePasswordChange}
              disabled={loading}
            />
          </FormItem>

          {error && (
            <div className={styles.errorMessage}>
              {error}
            </div>
          )}

          <Button
            block
            variant="primary"
            loading={loading}
            type="submit"
            className={styles.submitButton}
          >
            登录
          </Button>
        </Form>

        <div className={styles.footer}>
          <p>
            还没有账户？
            <Link to="/register" className={styles.registerLink}>
              立即注册
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
