import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark' | 'auto';
export type PrimaryColor = 'blue' | 'orange' | 'green' | 'purple' | 'pink' | 'cyan';

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme') as Theme;
    return saved || 'auto';
  });

  const [primaryColor, setPrimaryColorState] = useState<PrimaryColor>(() => {
    const saved = localStorage.getItem('primaryColor') as PrimaryColor;
    return saved || 'blue';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // 检测系统主题偏好
  const getSystemTheme = (): 'light' | 'dark' => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  };

  // 解析实际使用的主题
  const resolveTheme = (currentTheme: Theme): 'light' | 'dark' => {
    if (currentTheme === 'auto') {
      return getSystemTheme();
    }
    return currentTheme;
  };

  // 应用主题到DOM
  const applyTheme = (resolvedTheme: 'light' | 'dark') => {
    const root = document.documentElement;

    if (resolvedTheme === 'dark') {
      root.setAttribute('data-theme', 'dark');
      root.classList.add('dark');
    } else {
      root.setAttribute('data-theme', 'light');
      root.classList.remove('dark');
    }
  };

  // 应用主题色到DOM
  const applyPrimaryColor = (color: PrimaryColor) => {
    const root = document.documentElement;
    root.setAttribute('data-primary-color', color);

    // 定义主题色值
    const colorValues = {
      blue: '#1890ff',
      orange: '#ff7875',
      green: '#52c41a',
      purple: '#722ed1',
      pink: '#eb2f96',
      cyan: '#13c2c2',
    };

    // 设置CSS变量
    root.style.setProperty('--primary-color', colorValues[color]);
  };

  // 切换主题
  const toggleTheme = () => {
    const newTheme = resolvedTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  // 设置特定主题
  const setSpecificTheme = (newTheme: Theme) => {
    setTheme(newTheme);
  };

  // 设置主题色
  const setPrimaryColor = (color: PrimaryColor) => {
    setPrimaryColorState(color);
    localStorage.setItem('primaryColor', color);
    applyPrimaryColor(color);
  };

  // 监听主题变化
  useEffect(() => {
    const newResolvedTheme = resolveTheme(theme);
    setResolvedTheme(newResolvedTheme);
    applyTheme(newResolvedTheme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // 监听系统主题变化
  useEffect(() => {
    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleChange = () => {
        const newResolvedTheme = resolveTheme('auto');
        setResolvedTheme(newResolvedTheme);
        applyTheme(newResolvedTheme);
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  // 初始化主题
  useEffect(() => {
    const initialResolvedTheme = resolveTheme(theme);
    setResolvedTheme(initialResolvedTheme);
    applyTheme(initialResolvedTheme);
  }, []);

  // 初始化主题色
  useEffect(() => {
    applyPrimaryColor(primaryColor);
  }, []);

  return {
    theme,
    resolvedTheme,
    primaryColor,
    toggleTheme,
    setTheme: setSpecificTheme,
    setPrimaryColor,
    isLight: resolvedTheme === 'light',
    isDark: resolvedTheme === 'dark',
    isAuto: theme === 'auto',
  };
};
