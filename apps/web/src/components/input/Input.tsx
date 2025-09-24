import React, { forwardRef, useState } from 'react';
import { AiOutlineEye, AiOutlineEyeInvisible, AiOutlineClose } from 'react-icons/ai';

import styles from './index.module.less';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  /** 标签文本 */
  label?: string;
  /** 错误信息 */
  error?: string;
  /** 帮助文本 */
  helperText?: string;
  /** 输入框尺寸 */
  size?: 'small' | 'medium' | 'large';
  /** 输入框状态 */
  status?: 'default' | 'error' | 'warning' | 'success';
  /** 前缀图标 */
  prefix?: React.ReactNode;
  /** 后缀图标 */
  suffix?: React.ReactNode;
  /** 是否显示清除按钮 */
  allowClear?: boolean;
  /** 是否显示字符计数 */
  showCount?: boolean;
  /** 最大字符数 */
  maxLength?: number;
  /** 是否必填 */
  required?: boolean;
  /** 容器类名 */
  containerClassName?: string;
  /** 清除回调 */
  onClear?: () => void;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  size = 'medium',
  status = 'default',
  prefix,
  suffix,
  allowClear = false,
  showCount = false,
  maxLength,
  required = false,
  disabled = false,
  type = 'text',
  value,
  defaultValue,
  containerClassName,
  className,
  onClear,
  onChange,
  ...props
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue || '');

  const currentValue = value !== undefined ? value : internalValue;
  const isPassword = type === 'password';
  const actualType = isPassword && showPassword ? 'text' : type;

  // 确定状态
  const actualStatus = error ? 'error' : status;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (value === undefined) {
      setInternalValue(newValue);
    }
    onChange?.(e);
  };

  const handleClear = () => {
    if (value === undefined) {
      setInternalValue('');
    }
    onClear?.();

    // 创建一个合成事件来触发 onChange
    const syntheticEvent = {
      target: { value: '' },
      currentTarget: { value: '' }
    } as React.ChangeEvent<HTMLInputElement>;
    onChange?.(syntheticEvent);
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const containerClasses = [
    styles.inputContainer,
    styles[`inputContainer--${size}`],
    styles[`inputContainer--${actualStatus}`],
    disabled && styles['inputContainer--disabled'],
    containerClassName
  ].filter(Boolean).join(' ');

  const inputClasses = [
    styles.input,
    prefix && styles['input--with-prefix'],
    (suffix || isPassword || allowClear) && styles['input--with-suffix'],
    className
  ].filter(Boolean).join(' ');

  const renderSuffix = () => {
    const elements: React.ReactNode[] = [];

    // 清除按钮
    if (allowClear && currentValue && !disabled) {
      elements.push(
        <button
          key="clear"
          type="button"
          className={styles.clearButton}
          onClick={handleClear}
          tabIndex={-1}
        >
          <AiOutlineClose />
        </button>
      );
    }

    // 密码可见性切换
    if (isPassword) {
      elements.push(
        <button
          key="password-toggle"
          type="button"
          className={styles.passwordToggle}
          onClick={togglePasswordVisibility}
          tabIndex={-1}
        >
          {showPassword ? <AiOutlineEyeInvisible /> : <AiOutlineEye />}
        </button>
      );
    }

    // 自定义后缀
    if (suffix) {
      elements.push(
        <span key="suffix" className={styles.suffixIcon}>
          {suffix}
        </span>
      );
    }

    return elements.length > 0 ? (
      <div className={styles.suffixWrapper}>
        {elements}
      </div>
    ) : null;
  };

  const renderHelperContent = () => {
    const hasError = error;
    const hasHelper = helperText;
    const hasCount = showCount && maxLength;

    if (!hasError && !hasHelper && !hasCount) return null;

    return (
      <div className={styles.helperRow}>
        <div className={styles.helperText}>
          {hasError && (
            <span className={styles.errorText}>{error}</span>
          )}
          {!hasError && hasHelper && (
            <span className={styles.helper}>{helperText}</span>
          )}
        </div>
        {hasCount && (
          <span className={styles.count}>
            {String(currentValue).length}/{maxLength}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className={containerClasses}>
      {label && (
        <label className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}

      <div className={styles.inputWrapper}>
        {prefix && (
          <div className={styles.prefixWrapper}>
            <span className={styles.prefixIcon}>{prefix}</span>
          </div>
        )}

        <input
          ref={ref}
          type={actualType}
          value={currentValue}
          disabled={disabled}
          maxLength={maxLength}
          className={inputClasses}
          onChange={handleChange}
          {...props}
        />

        {renderSuffix()}
      </div>

      {renderHelperContent()}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
