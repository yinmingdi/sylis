import { Button } from 'antd-mobile';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AiOutlineArrowLeft } from 'react-icons/ai';

import type { ActionItem } from '../app-bar';
import { useRequiredScrollContext } from '../scroll-view';
import styles from './index.module.less';
import type { SliverAppBarProps } from './types';

export const SliverAppBar: React.FC<SliverAppBarProps> = ({
  title,
  leading,
  actions,
  bottom,
  backgroundColor = '#ffffff',
  elevation = true,
  centerTitle = true,
  automaticallyImplyLeading = true,
  flexibleSpace,
  expandedHeight = 200,
  collapsedHeight = 44,
  pinned = true,
  floating = false,
  snap = false,
  stretch = false,
  foregroundColor,
  className = '',
  onBack,
}) => {
  const scrollContext = useRequiredScrollContext();
  const [scrollProgress, setScrollProgress] = useState(0); // 0 = 展开, 1 = 完全折叠
  const [isVisible, setIsVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const sliverId = useRef(`sliver-${Math.random()}`);

  // 计算当前高度
  const currentHeight =
    expandedHeight - (expandedHeight - collapsedHeight) * scrollProgress;

  // 处理滚动
  useEffect(() => {
    const handleScroll = (scrollTop: number) => {
      const range = expandedHeight - collapsedHeight;
      const progress = Math.min(Math.max(scrollTop / range, 0), 1);
      setScrollProgress(progress);

      // floating 效果：向下滚动隐藏，向上滚动显示
      if (floating && !pinned) {
        if (scrollContext.direction === 'down' && scrollTop > collapsedHeight) {
          setIsVisible(false);
        } else if (scrollContext.direction === 'up') {
          setIsVisible(true);
        }
      }
    };

    const unregister = scrollContext.registerSliver(sliverId.current, {
      onScroll: handleScroll,
      getHeight: () => currentHeight,
    });

    return unregister;
  }, [
    scrollContext,
    expandedHeight,
    collapsedHeight,
    floating,
    pinned,
    currentHeight,
  ]);

  // 渲染左侧区域
  const renderLeading = useCallback(() => {
    if (leading !== undefined) {
      return leading;
    }

    if (automaticallyImplyLeading && onBack) {
      return (
        <Button
          size="small"
          fill="none"
          onClick={onBack}
          className={styles.actionButton}
        >
          <AiOutlineArrowLeft />
        </Button>
      );
    }

    return null;
  }, [leading, automaticallyImplyLeading, onBack]);

  // 渲染右侧操作按钮
  const renderActions = useCallback(() => {
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
  }, [actions]);

  const hasLeading = !!renderLeading();
  const hasActions = !!renderActions();

  // 容器样式
  const containerStyle: React.CSSProperties = {
    height: pinned ? `${collapsedHeight}px` : `${currentHeight}px`,
    backgroundColor,
    transform: !isVisible && !pinned ? 'translateY(-100%)' : 'translateY(0)',
    transition: floating
      ? 'transform 0.2s ease-out'
      : snap
        ? 'height 0.2s ease-out'
        : undefined,
  };

  // 内容区域样式
  const contentStyle: React.CSSProperties = {
    height: `${currentHeight}px`,
    color: foregroundColor,
  };

  // 背景透明度
  const backgroundOpacity = pinned ? scrollProgress : 1;

  return (
    <div
      ref={containerRef}
      className={`${styles.sliverAppBarContainer} ${pinned ? styles.pinned : ''} ${elevation ? styles.elevated : ''} ${className}`}
      style={containerStyle}
    >
      <div className={styles.sliverAppBarContent} style={contentStyle}>
        {/* FlexibleSpace 背景 */}
        {flexibleSpace && (
          <div
            className={styles.flexibleSpace}
            style={{
              height: `${currentHeight}px`,
              opacity: stretch ? 1 + scrollProgress * 0.3 : 1,
            }}
          >
            {flexibleSpace}
          </div>
        )}

        {/* 渐变遮罩 */}
        {flexibleSpace && (
          <div
            className={styles.overlay}
            style={{
              opacity: backgroundOpacity,
              background: `linear-gradient(to bottom, transparent, ${backgroundColor})`,
            }}
          />
        )}

        {/* 主导航栏 */}
        <div
          className={styles.appBar}
          style={{
            height: `${collapsedHeight}px`,
            position: 'absolute',
            bottom: bottom ? undefined : 0,
            top: bottom ? 0 : undefined,
            backgroundColor: flexibleSpace
              ? `rgba(255, 255, 255, ${backgroundOpacity})`
              : backgroundColor,
          }}
        >
          {hasLeading && (
            <div className={styles.leading}>{renderLeading()}</div>
          )}

          <div
            className={`${styles.title} ${centerTitle ? styles.titleCenter : styles.titleStart} ${
              !hasLeading && !hasActions ? styles.titleFullWidth : ''
            }`}
            style={{
              opacity: flexibleSpace ? Math.max(scrollProgress, 0.3) : 1,
              transform: `scale(${1 - scrollProgress * 0.2})`,
            }}
          >
            {title}
          </div>

          {hasActions && (
            <div className={styles.actions}>{renderActions()}</div>
          )}
        </div>

        {/* Bottom 区域 */}
        {bottom && (
          <div
            className={styles.bottom}
            style={{
              position: 'absolute',
              bottom: 0,
              width: '100%',
            }}
          >
            {bottom}
          </div>
        )}
      </div>
    </div>
  );
};
