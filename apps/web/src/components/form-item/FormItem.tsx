import React from 'react';

import styles from './index.module.less';

export interface FormItemProps {
  /** 标签文本 */
  label?: string;
  /** 是否必填 */
  required?: boolean;
  /** 错误信息 */
  error?: string;
  /** 帮助文本 */
  helperText?: string;
  /** 标签位置 */
  labelPosition?: 'top' | 'left' | 'right';
  /** 标签宽度（当位置为left或right时） */
  labelWidth?: number | string;
  /** 标签对齐方式 */
  labelAlign?: 'left' | 'center' | 'right';
  /** 验证状态 */
  status?: 'default' | 'error' | 'warning' | 'success' | 'validating';
  /** 额外的类名 */
  className?: string;
  /** 子元素 */
  children?: React.ReactNode;
  /** 表单项的额外说明 */
  extra?: React.ReactNode;
  /** 是否隐藏冒号 */
  colon?: boolean;
}

export const FormItem: React.FC<FormItemProps> = ({
  label,
  required = false,
  error,
  helperText,
  labelPosition = 'top',
  labelWidth,
  labelAlign = 'left',
  status = 'default',
  className,
  children,
  extra,
  colon = true,
  ...props
}) => {
  // 确定实际状态
  const actualStatus = error ? 'error' : status;

  const containerClasses = [
    styles.formItem,
    styles[`formItem--${labelPosition}`],
    styles[`formItem--${actualStatus}`],
    className
  ].filter(Boolean).join(' ');

  const labelClasses = [
    styles.label,
    styles[`label--${labelAlign}`]
  ].filter(Boolean).join(' ');

  const labelStyle: React.CSSProperties = {};
  if (labelPosition !== 'top' && labelWidth) {
    labelStyle.width = typeof labelWidth === 'number' ? `${labelWidth}px` : labelWidth;
    labelStyle.flexShrink = 0;
  }

  const renderLabel = () => {
    if (!label) return null;

    return (
      <div className={labelClasses} style={labelStyle}>
        <span className={styles.labelText}>
          {label}
          {colon && labelPosition !== 'top' && ':'}
        </span>
        {required && <span className={styles.required}>*</span>}
      </div>
    );
  };

  const renderContent = () => {
    return (
      <div className={styles.content}>
        <div className={styles.control}>
          {children}
        </div>
        {renderHelperContent()}
      </div>
    );
  };

  const renderHelperContent = () => {
    const hasError = error;
    const hasHelper = helperText;
    const hasExtra = extra;

    if (!hasError && !hasHelper && !hasExtra) return null;

    return (
      <div className={styles.helperContent}>
        {hasError && (
          <div className={styles.errorText}>{error}</div>
        )}
        {!hasError && hasHelper && (
          <div className={styles.helperText}>{helperText}</div>
        )}
        {hasExtra && (
          <div className={styles.extraText}>{extra}</div>
        )}
      </div>
    );
  };

  if (labelPosition === 'top') {
    return (
      <div className={containerClasses} {...props}>
        {renderLabel()}
        {renderContent()}
      </div>
    );
  }

  return (
    <div className={containerClasses} {...props}>
      {renderLabel()}
      {renderContent()}
    </div>
  );
};

export default FormItem;
