import { Toast } from 'antd-mobile';
import { useState, useCallback, useRef, useEffect } from 'react';

import { sendEmailCode } from '../../../modules/user/api';

const COUNTDOWN_DURATION = 60; // 60秒倒计时

export const useEmailCode = () => {
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // 开始倒计时
  const startCountdown = useCallback(() => {
    setCountdown(COUNTDOWN_DURATION);

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // 发送验证码
  const sendCode = useCallback(
    async (email: string) => {
      if (!email) {
        setError('请输入邮箱地址');
        return false;
      }

      // 简单的邮箱格式验证
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError('邮箱格式不正确');
        return false;
      }

      setLoading(true);
      setError('');

      try {
        await sendEmailCode({ email });

        Toast.show({
          icon: 'success',
          content: '验证码已发送到您的邮箱',
          duration: 2000,
        });

        startCountdown();
        return true;
      } catch (error: any) {
        const errorMessage =
          error?.response?.data?.message || '发送验证码失败，请重试';
        setError(errorMessage);

        Toast.show({
          icon: 'fail',
          content: errorMessage,
          duration: 3000,
        });

        return false;
      } finally {
        setLoading(false);
      }
    },
    [startCountdown],
  );

  // 清除错误
  const clearError = useCallback(() => {
    setError('');
  }, []);

  // 重置状态
  const reset = useCallback(() => {
    setLoading(false);
    setCountdown(0);
    setError('');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 是否可以发送验证码
  const canSendCode = countdown === 0 && !loading;

  // 按钮文本
  const getButtonText = () => {
    if (loading) return '发送中...';
    if (countdown > 0) return `${countdown}s后重发`;
    return '获取验证码';
  };

  return {
    loading,
    countdown,
    error,
    canSendCode,
    sendCode,
    clearError,
    reset,
    getButtonText,
  };
};
