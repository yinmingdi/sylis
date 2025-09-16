import { emailRegExp, passwordRegExp } from '@sylis/utils';
import { Button, Input, Toast, Form } from 'antd-mobile';
import { useState } from 'react';

import { register, sendEmailCode } from '../../modules/user/api';

// 表单校验规则抽离
const emailRules = [
    { required: true, message: '请输入邮箱' },
    { pattern: emailRegExp, message: '邮箱格式不正确' }
];
const codeRules = [
    { required: true, message: '请输入验证码' }
];
const passwordRules = [
    { required: true, message: '请输入密码' },
    { min: 8, message: '密码长度不能少于8位' },
    { pattern: passwordRegExp, message: '密码格式不正确必须包含字母和数字' }
];
const confirmPasswordRules = [
    { required: true, message: '请确认密码' },
    ({ getFieldValue }: any) => ({
        validator(_: any, value: string) {
            if (!value || getFieldValue('password') === value) {
                return Promise.resolve();
            }
            return Promise.reject(new Error('两次输入的密码不一致'));
        }
    })
];

export default function Register() {
    const [loading, setLoading] = useState(false);
    const [codeLoading, setCodeLoading] = useState(false);
    const [form] = Form.useForm();

    // 发送验证码
    const handleSendCode = async () => {
        const email = form.getFieldValue('email');
        if (!email) {
            Toast.show({ content: '请输入邮箱' });
            return;
        }
        setCodeLoading(true);
        try {
            await sendEmailCode({ email });
            Toast.show({ content: '验证码已发送' });
        } catch (e: any) {
            Toast.show({ content: e?.response?.data?.message || '发送失败' });
        } finally {
            setCodeLoading(false);
        }
    };

    // 注册提交
    const handleFinish = async (values: any) => {
        setLoading(true);
        try {
            await register({ email: values.email, code: values.code, password: values.password });
            Toast.show({ content: '注册成功' });
            // 可跳转到登录页
        } catch (e: any) {
            Toast.show({ content: e?.response?.data?.message || '注册失败' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: 24 }}>
            <Form
                form={form}
                layout="vertical"
                onFinish={handleFinish}
                footer={
                    <Button block color="primary" loading={loading} type="submit">
                        注册
                    </Button>
                }
            >
                <Form.Item
                    name="email"
                    rules={emailRules}
                >
                    <Input placeholder="请输入邮箱" type="email" clearable />
                </Form.Item>
                <Form.Item
                    name="code"
                    rules={codeRules}
                >
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Input placeholder="请输入验证码" clearable />
                        <Button size="small" loading={codeLoading} onClick={handleSendCode} type="button">
                            获取验证码
                        </Button>
                    </div>
                </Form.Item>
                <Form.Item
                    name="password"
                    rules={passwordRules}
                >
                    <Input placeholder="请输入密码" type="password" clearable />
                </Form.Item>
                <Form.Item
                    name="confirmPassword"
                    dependencies={['password']}
                    rules={confirmPasswordRules}
                >
                    <Input placeholder="请输入确认密码" type="password" clearable />
                </Form.Item>
            </Form>
        </div>
    );
} 