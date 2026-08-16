import { Button } from 'antd-mobile';
import React from 'react';

import styles from './index.module.less';

export interface QuickToolbarItem {
  key: string;
  icon: React.ReactNode;
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  color?: string;
  selected?: boolean;
  group?: 'main' | 'mode'; // 分组：主要工具或模式工具
}

interface QuickToolbarProps {
  items: QuickToolbarItem[];
  visible?: boolean;
  className?: string;
  children?: React.ReactNode;
  layout?: 'horizontal' | 'vertical'; // 布局方向
}

const QuickToolbar: React.FC<QuickToolbarProps> = ({
  items,
  visible = true,
  className = '',
  children,
  layout = 'horizontal',
}) => {
  if (!visible) return null;

  // 按分组分离工具项
  const mainTools = items.filter(
    (item) => !item.group || item.group === 'main',
  );
  const modeTools = items.filter((item) => item.group === 'mode');

  const renderToolButton = (item: QuickToolbarItem) => (
    <Button
      key={item.key}
      size="small"
      fill="none"
      onClick={item.onClick}
      disabled={item.disabled}
      aria-label={item.label}
      className={`${styles.toolbarButton} ${item.selected ? styles.selected : ''} ${item.group === 'mode' ? styles.modeButton : ''}`}
      style={item.color && !item.selected ? { color: item.color } : undefined}
    >
      <div className={styles.buttonContent}>
        <div className={styles.iconWrapper}>{item.icon}</div>
        {item.label && <span className={styles.buttonLabel}>{item.label}</span>}
      </div>
    </Button>
  );

  return (
    <div className={`${styles.quickToolbar} ${styles[layout]} ${className}`}>
      <div className={styles.toolbarContent}>
        {/* 主要工具区域 */}
        <div className={styles.mainTools}>
          {mainTools.map(renderToolButton)}
        </div>

        {/* 分隔线 */}
        {modeTools.length > 0 && mainTools.length > 0 && (
          <div className={styles.divider} />
        )}

        {/* 模式工具区域 */}
        {modeTools.length > 0 && (
          <div className={styles.modeTools}>
            {modeTools.map(renderToolButton)}
          </div>
        )}

        {children}
      </div>
    </div>
  );
};

export default QuickToolbar;
