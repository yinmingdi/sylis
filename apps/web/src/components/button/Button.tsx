import React from 'react';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';

import styles from './index.module.less';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 按钮类型 */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  /** 按钮尺寸 */
  size?: 'small' | 'medium' | 'large';
  /** 加载状态 */
  loading?: boolean;
  /** 禁用状态 */
  disabled?: boolean;
  /** 图标（左侧） */
  icon?: React.ReactNode;
  /** 图标（右侧） */
  iconRight?: React.ReactNode;
  /** 圆角样式 */
  shape?: 'default' | 'round' | 'circle';
  /** 是否块级按钮 */
  block?: boolean;
  /** 子元素 */
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  icon,
  iconRight,
  shape = 'default',
  block = false,
  children,
  className,
  onClick,
  ...props
}) => {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (loading || disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  const classNames = [
    styles.button,
    styles[`button--${variant}`],
    styles[`button--${size}`],
    styles[`button--${shape}`],
    loading && styles['button--loading'],
    disabled && styles['button--disabled'],
    block && styles['button--block'],
    className
  ].filter(Boolean).join(' ');

  const renderIcon = () => {
    if (loading) {
      return <AiOutlineLoading3Quarters className={styles.loadingIcon} />;
    }
    return icon;
  };

  const renderContent = () => {
    const hasText = children && React.Children.count(children) > 0;
    const hasIcon = icon || loading;
    const hasRightIcon = iconRight && !loading;

    return (
      <>
        {hasIcon && (
          <span className={styles.iconWrapper}>
            {renderIcon()}
          </span>
        )}
        {hasText && (
          <span className={styles.textWrapper}>
            {children}
          </span>
        )}
        {hasRightIcon && (
          <span className={styles.iconWrapper}>
            {iconRight}
          </span>
        )}
      </>
    );
  };

  return (
    <button
      className={classNames}
      disabled={disabled || loading}
      onClick={handleClick}
      {...props}
    >
      {renderContent()}
    </button>
  );
};

export default Button;
