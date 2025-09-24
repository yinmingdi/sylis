import { emailRegExp, passwordRegExp } from '@sylis/utils';
import React from 'react';
import { Link } from 'react-router-dom';

import { Form, FormItem, Input, Button, useForm } from '../../components';
import { useEmailCode } from './hooks/useEmailCode';
import { useRegister } from './hooks/useRegister';
import styles from './index.module.less';

// 表单验证函数
const validateEmail = (email: string): string | undefined => {
  if (!email) return '请输入邮箱地址';
  if (!emailRegExp.test(email)) return '邮箱格式不正确';
  return undefined;
};

const validateCode = (code: string): string | undefined => {
  if (!code) return '请输入验证码';
  if (code.length !== 6) return '验证码应为6位数字';
  return undefined;
};

const validatePassword = (password: string): string | undefined => {
  if (!password) return '请输入密码';
  if (password.length < 8) return '密码长度不能少于8位';
  if (!passwordRegExp.test(password)) return '密码必须包含字母和数字';
  return undefined;
};

const validateConfirmPassword = (confirmPassword: string, password: string): string | undefined => {
  if (!confirmPassword) return '请确认密码';
  if (confirmPassword !== password) return '两次输入的密码不一致';
  return undefined;
};

export default function Register() {
  const form = useForm();
  const { loading, handleRegister } = useRegister();
  const {
    loading: codeLoading,
    canSendCode,
    sendCode,
    getButtonText
  } = useEmailCode();

  // 表单字段变化处理
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    form.setFieldValue('email', value);

    // 清除错误
    if (form.getFieldError('email')) {
      form.setFieldError('email', '');
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    form.setFieldValue('code', value);

    // 清除错误
    if (form.getFieldError('code')) {
      form.setFieldError('code', '');
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    form.setFieldValue('password', value);

    // 清除错误
    if (form.getFieldError('password')) {
      form.setFieldError('password', '');
    }
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    form.setFieldValue('confirmPassword', value);

    // 清除错误
    if (form.getFieldError('confirmPassword')) {
      form.setFieldError('confirmPassword', '');
    }
  };

  // 发送验证码
  const handleSendCode = async () => {
    const email = form.getFieldValue('email');
    const emailError = validateEmail(email);

    if (emailError) {
      form.setFieldError('email', emailError);
      return;
    }

    try {
      await sendCode(email);
    } catch {
      // 发送验证码失败
    }
  };

  // 表单验证
  const validateForm = (): boolean => {
    const values = form.getFieldsValue();
    const errors: Record<string, string> = {};

    const emailError = validateEmail(values.email);
    if (emailError) errors.email = emailError;

    const codeError = validateCode(values.code);
    if (codeError) errors.code = codeError;

    const passwordError = validatePassword(values.password);
    if (passwordError) errors.password = passwordError;

    const confirmPasswordError = validateConfirmPassword(values.confirmPassword, values.password);
    if (confirmPasswordError) errors.confirmPassword = confirmPasswordError;

    // 设置错误
    form.setFieldsError(errors);

    return Object.keys(errors).length === 0;
  };

  // 注册提交
  const handleFinish = async (values: any) => {
    if (!validateForm()) {
      return;
    }

    await handleRegister({
      email: values.email,
      code: values.code,
      password: values.password,
      confirmPassword: values.confirmPassword,
    });
  };

  return (
    <div className={styles.registerPage}>
      <div className={styles.content}>
        <div className={styles.hero}>
          <h1>创建账户</h1>
          <p>加入Sylis，开启您的英语学习之旅</p>
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
            />
          </FormItem>

          <FormItem
            label="验证码"
            required
            error={form.getFieldError('code')}
          >
            <div className={styles.codeInputWrapper}>
              <Input
                name="code"
                placeholder="请输入6位验证码"
                allowClear
                maxLength={6}
                value={form.getFieldValue('code') || ''}
                onChange={handleCodeChange}
              />
              <Button
                className={styles.codeButton}
                loading={codeLoading}
                disabled={!canSendCode}
                onClick={handleSendCode}
                variant="outline"
              >
                {getButtonText()}
              </Button>
            </div>
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
            />
          </FormItem>

          <FormItem
            label="确认密码"
            required
            error={form.getFieldError('confirmPassword')}
          >
            <Input
              name="confirmPassword"
              placeholder="请再次输入密码"
              type="password"
              allowClear
              className={styles.formInput}
              value={form.getFieldValue('confirmPassword') || ''}
              onChange={handleConfirmPasswordChange}
            />
          </FormItem>

          <Button
            block
            variant="primary"
            loading={loading}
            type="submit"
            className={styles.submitButton}
          >
            注册
          </Button>
        </Form>

        <div className={styles.footer}>
          <p>
            已有账户？
            <Link to="/login" className={styles.loginLink}>
              立即登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
