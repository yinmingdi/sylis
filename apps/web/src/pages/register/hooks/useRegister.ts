import { Toast } from 'antd-mobile';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { register } from '../../../modules/user/api';

interface RegisterFormData {
  email: string;
  code: string;
  password: string;
  confirmPassword: string;
}

export const useRegister = () => {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  const handleRegister = async (formData: RegisterFormData) => {
    setLoading(true);
    setErrors({});

    try {
      await register({
        email: formData.email,
        code: formData.code,
        password: formData.password,
      });

      Toast.show({
        icon: 'success',
        content: '注册成功！请登录您的账户',
        duration: 2000,
      });

      // 延迟跳转，让用户看到成功提示
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1500);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || '注册失败，请重试';

      // 根据错误类型设置特定字段的错误
      if (errorMessage.includes('邮箱')) {
        setErrors({ email: errorMessage });
      } else if (errorMessage.includes('验证码')) {
        setErrors({ code: errorMessage });
      } else if (errorMessage.includes('密码')) {
        setErrors({ password: errorMessage });
      } else {
        Toast.show({
          icon: 'fail',
          content: errorMessage,
          duration: 3000,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const clearError = (field: string) => {
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  };

  return {
    loading,
    errors,
    handleRegister,
    clearError,
  };
};
