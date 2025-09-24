import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toast } from 'antd-mobile';
import type { LoginReqDto } from '@sylis/shared/dto';

import { login } from '../../../modules/user/api';
import { getCurrentBook } from '../../../modules/books/api';
import { useUserStore } from '../../../modules/user/store';

interface UseLoginReturn {
  loading: boolean;
  error: string | null;
  handleLogin: (values: LoginReqDto) => Promise<void>;
  clearError: () => void;
}

export const useLogin = (): UseLoginReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setToken = useUserStore((state) => state.setToken);
  const navigate = useNavigate();

  const clearError = () => setError(null);

  const handleLogin = async (values: LoginReqDto) => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      // 执行登录
      const loginRes = await login(values);

      if (!loginRes.data?.token) {
        throw new Error('登录响应无效');
      }

      // 保存token
      setToken(loginRes.data.token);

      // 检查用户是否已选择学习图书
      try {
        const currentBookRes = await getCurrentBook();

        if (currentBookRes.data?.book) {
          // 用户已有学习图书，跳转到单词页面
          navigate('/vocabulary-learning', { replace: true });
          Toast.show({
            icon: 'success',
            content: '登录成功，欢迎回来！',
          });
        } else {
          // 用户未选择学习图书，跳转到选书页面
          navigate('/books', { replace: true });
          Toast.show({
            icon: 'success',
            content: '登录成功，请选择学习图书',
          });
        }
      } catch (bookError) {
        console.warn('获取当前图书失败，跳转到选书页面:', bookError);
        // 获取当前图书失败，默认跳转到选书页面
        navigate('/books', { replace: true });
        Toast.show({
          icon: 'success',
          content: '登录成功',
        });
      }
    } catch (err: any) {
      console.error('登录失败:', err);

      // 提取错误信息
      let errorMessage = '登录失败，请重试';

      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      Toast.show({
        icon: 'fail',
        content: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    handleLogin,
    clearError,
  };
};
