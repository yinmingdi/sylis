import { Button } from 'antd-mobile';
import React from 'react';
import { AiOutlineArrowLeft } from 'react-icons/ai';

import styles from './index.module.less';

interface ActionItem {
  icon: React.ReactNode;
  onClick: () => void;
  key?: string;
}

interface PageHeaderProps {
  title: string;
  onBack?: () => void;
  actions?: React.ReactNode | ActionItem[];
  leftActions?: React.ReactNode | ActionItem[];
  showBack?: boolean;
  leftIcon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  onBack,
  actions,
  leftActions,
  showBack = true,
  leftIcon,
  className = '',
  children,
}) => {
  // 检查是否有左右区域的内容
  const hasLeftContent = showBack && (onBack || leftActions);
  const hasRightContent = !!actions;
  const shouldCenterTakeFullWidth = !hasLeftContent && !hasRightContent;

  // 渲染左侧 actions
  const renderLeftActions = () => {
    // 优先使用 leftActions
    if (leftActions) {
      if (Array.isArray(leftActions)) {
        return leftActions.map((action, index) => (
          <Button
            key={action.key || index}
            size="small"
            fill="none"
            onClick={action.onClick}
            className={styles.actionButton}
          >
            {action.icon}
          </Button>
        ));
      }
      return leftActions;
    }

    // 如果没有 leftActions 但有 onBack，渲染默认返回按钮
    if (onBack) {
      return (
        <Button
          size="small"
          fill="none"
          onClick={onBack}
          className={styles.actionButton}
        >
          {leftIcon || <AiOutlineArrowLeft />}
        </Button>
      );
    }

    return null;
  };

  // 渲染右侧 actions
  const renderActions = () => {
    if (!actions) return null;

    // 如果是数组，渲染 action 按钮
    if (Array.isArray(actions)) {
      return actions.map((action, index) => (
        <Button
          key={action.key || index}
          size="small"
          fill="none"
          onClick={action.onClick}
          className={styles.actionButton}
        >
          {action.icon}
        </Button>
      ));
    }

    // 如果是 ReactNode，直接渲染
    return actions;
  };

  return (
    <div className={`${styles.pageHeader} ${className}`}>
      {hasLeftContent && (
        <div className={styles.left}>
          {renderLeftActions()}
        </div>
      )}

      <div className={`${styles.center} ${shouldCenterTakeFullWidth ? styles.centerFullWidth : ''}`}>
        {children ? children : (
          <div className={styles.title}>
            {title}
          </div>
        )}
      </div>

      {hasRightContent && (
        <div className={styles.right}>
          {renderActions()}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
