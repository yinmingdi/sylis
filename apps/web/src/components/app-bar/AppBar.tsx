import { Button } from 'antd-mobile';
import React, { useCallback } from 'react';
import { AiOutlineArrowLeft } from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import type { ActionItem, AppBarProps } from './types';

export const AppBar: React.FC<AppBarProps> = ({
  title,
  leading,
  actions,
  bottom,
  backgroundColor,
  elevation = true,
  height = 44,
  automaticallyImplyLeading = true,
  flexibleSpace,
  className = '',
  onBack,
  children,
}) => {
  const navigate = useNavigate();
  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  }, [onBack, navigate]);
  // 渲染左侧区域
  const renderLeading = () => {
    if (leading !== undefined) {
      return leading;
    }


    // 自动显示返回按钮
    if (automaticallyImplyLeading) {
      return (
        <Button
          size="small"
          fill="none"
          onClick={handleBack}
          className={styles.actionButton}
        >
          <AiOutlineArrowLeft />
        </Button>
      );
    }

    return null;
  };

  // 渲染右侧操作按钮
  const renderActions = () => {
    if (!actions) return null;

    if (Array.isArray(actions)) {
      return (actions as ActionItem[]).map((action, index) => (
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

    return actions;
  };

  const hasLeading = !!renderLeading();
  const hasActions = !!renderActions();

  const containerStyle: React.CSSProperties = {
    backgroundColor,
  };

  const appBarStyle: React.CSSProperties = {
    height: `${height}px`,
  };

  return (
    <div
      className={`${styles.appBarContainer} ${elevation ? styles.elevated : ''} ${className}`}
      style={containerStyle}
    >
      {/* FlexibleSpace 背景 */}
      {flexibleSpace && (
        <div className={styles.flexibleSpace}>{flexibleSpace}</div>
      )}

      {/* 主导航栏 */}
      <div className={styles.appBar} style={appBarStyle}>
        {hasLeading && <div className={styles.leading}>{renderLeading()}</div>}

        <div
          className={`${styles.center} ${!hasLeading && !hasActions ? styles.centerFullWidth : ''}`}
        >
          {children ? children : (
            <div className={styles.title}>{title}</div>
          )}
        </div>

        {hasActions && <div className={styles.actions}>{renderActions()}</div>}
      </div>

      {/* Bottom 区域 */}
      {bottom && <div className={styles.bottom}>{bottom}</div>}
    </div>
  );
};
