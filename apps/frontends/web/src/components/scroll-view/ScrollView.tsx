import { SpinLoading } from 'antd-mobile';
import React, {
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import styles from './index.module.less';
import { ScrollContext } from './ScrollContext';
import type { SliverCallbacks } from './ScrollContext';
import type { ScrollEvent, ScrollViewProps } from './types';

export const PageScrollView = React.forwardRef<any, ScrollViewProps>(
  (
    {
      children,
      direction = 'vertical',
      reverse = false,
      physics = 'default',
      refreshable = false,
      onRefresh,
      refreshing: externalRefreshing,
      loadMoreable = false,
      onLoadMore,
      hasMore = true,
      loadThreshold = 300,
      onScroll,
      onScrollToTop,
      onScrollToBottom,
      className = '',
      style,
      backgroundColor,
      // omitted unused props to avoid lints: stickyHeaderIndices, scrollEventThrottle
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [scrollDirection, setScrollDirection] = useState<
      'up' | 'down' | 'left' | 'right' | null
    >(null);
    const [isScrolling, setIsScrolling] = useState(false);
    const [internalRefreshing, setInternalRefreshing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const [refreshState, setRefreshState] = useState<
      'idle' | 'pulling' | 'ready' | 'refreshing'
    >('idle');

    const lastScrollTop = useRef(0);
    const lastScrollLeft = useRef(0);
    const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartY = useRef(0);
    const isPulling = useRef(false);
    const sliverCallbacks = useRef<Map<string, SliverCallbacks>>(new Map());

    const refreshing = externalRefreshing ?? internalRefreshing;

    // 注册 Sliver 组件
    const registerSliver = useCallback(
      (id: string, callbacks: SliverCallbacks) => {
        sliverCallbacks.current.set(id, callbacks);
        return () => {
          sliverCallbacks.current.delete(id);
        };
      },
      [],
    );

    // 滚动事件处理
    const handleScroll = useCallback(
      (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const currentScrollTop = target.scrollTop;
        const currentScrollLeft = target.scrollLeft;

        setScrollTop(currentScrollTop);
        setScrollLeft(currentScrollLeft);
        setIsScrolling(true);

        // 计算滚动方向
        if (currentScrollTop > lastScrollTop.current) {
          setScrollDirection('down');
        } else if (currentScrollTop < lastScrollTop.current) {
          setScrollDirection('up');
        }

        if (currentScrollLeft > lastScrollLeft.current) {
          setScrollDirection('right');
        } else if (currentScrollLeft < lastScrollLeft.current) {
          setScrollDirection('left');
        }

        lastScrollTop.current = currentScrollTop;
        lastScrollLeft.current = currentScrollLeft;

        // 通知所有注册的 Sliver 组件
        sliverCallbacks.current.forEach((callbacks) => {
          callbacks.onScroll?.(currentScrollTop);
        });

        // 触发外部回调
        const scrollEvent: ScrollEvent = {
          scrollTop: currentScrollTop,
          scrollLeft: currentScrollLeft,
          scrollHeight: target.scrollHeight,
          scrollWidth: target.scrollWidth,
          clientHeight: target.clientHeight,
          clientWidth: target.clientWidth,
          isAtTop: currentScrollTop === 0,
          isAtBottom:
            currentScrollTop + target.clientHeight >= target.scrollHeight - 1,
          direction: scrollDirection,
        };

        onScroll?.(scrollEvent);

        // 滚动到顶部
        if (scrollEvent.isAtTop) {
          onScrollToTop?.();
        }

        // 滚动到底部
        if (scrollEvent.isAtBottom) {
          onScrollToBottom?.();
        }

        // 上拉加载更多
        if (
          loadMoreable &&
          hasMore &&
          !loading &&
          !refreshing &&
          target.scrollHeight - currentScrollTop - target.clientHeight <
            loadThreshold
        ) {
          setLoading(true);
          onLoadMore?.()
            .catch((err) => console.error('Load more failed:', err))
            .finally(() => setLoading(false));
        }

        // 重置滚动状态
        if (scrollTimer.current) {
          clearTimeout(scrollTimer.current);
        }
        scrollTimer.current = setTimeout(() => {
          setIsScrolling(false);
          setScrollDirection(null);
        }, 150);
      },
      [
        scrollDirection,
        onScroll,
        onScrollToTop,
        onScrollToBottom,
        loadMoreable,
        hasMore,
        loading,
        refreshing,
        loadThreshold,
        onLoadMore,
      ],
    );

    // 下拉刷新 - Touch 事件
    const handleTouchStart = useCallback(
      (e: React.TouchEvent) => {
        if (!refreshable || refreshing) return;

        const scrollTop = containerRef.current?.scrollTop || 0;
        if (scrollTop === 0) {
          touchStartY.current = e.touches[0].clientY;
          isPulling.current = true;
          setRefreshState('pulling');
        }
      },
      [refreshable, refreshing],
    );

    const handleTouchMove = useCallback(
      (e: React.TouchEvent) => {
        if (!isPulling.current || !refreshable || refreshing) return;

        const deltaY = e.touches[0].clientY - touchStartY.current;

        if (deltaY > 0) {
          // 阻止默认滚动
          e.preventDefault();

          // 应用阻尼效果
          const damping = 0.5;
          const distance = Math.min(deltaY * damping, 120);
          setPullDistance(distance);

          if (distance > 60) {
            setRefreshState('ready');
          } else {
            setRefreshState('pulling');
          }
        }
      },
      [refreshable, refreshing],
    );

    const handleTouchEnd = useCallback(() => {
      if (!isPulling.current || !refreshable) return;

      isPulling.current = false;

      if (refreshState === 'ready') {
        setRefreshState('refreshing');
        setPullDistance(60);
        setInternalRefreshing(true);

        onRefresh?.()
          .catch((err) => console.error('Refresh failed:', err))
          .finally(() => {
            setRefreshState('idle');
            setPullDistance(0);
            setInternalRefreshing(false);
          });
      } else {
        setRefreshState('idle');
        setPullDistance(0);
      }
    }, [refreshable, refreshState, onRefresh]);

    // 暴露控制方法
    useImperativeHandle(
      ref,
      () => ({
        scrollTo: ({
          x = 0,
          y = 0,
          animated = true,
        }: {
          x?: number;
          y?: number;
          animated?: boolean;
        }) => {
          if (containerRef.current) {
            containerRef.current.scrollTo({
              left: x,
              top: y,
              behavior: animated ? 'smooth' : 'auto',
            });
          }
        },
        scrollToTop: (animated = true) => {
          if (containerRef.current) {
            containerRef.current.scrollTo({
              top: 0,
              behavior: animated ? 'smooth' : 'auto',
            });
          }
        },
        scrollToBottom: (animated = true) => {
          if (containerRef.current) {
            containerRef.current.scrollTo({
              top: containerRef.current.scrollHeight,
              behavior: animated ? 'smooth' : 'auto',
            });
          }
        },
        getScrollPosition: () => ({
          x: scrollLeft,
          y: scrollTop,
        }),
      }),
      [scrollLeft, scrollTop],
    );

    // Context 值
    const contextValue = {
      scrollTop,
      scrollLeft,
      direction: scrollDirection,
      isScrolling,
      registerSliver,
    };

    const containerStyle: React.CSSProperties = {
      ...style,
      backgroundColor,
      overflowX: direction === 'horizontal' ? 'auto' : 'hidden',
      overflowY: direction === 'vertical' ? 'auto' : 'hidden',
    };

    const contentStyle: React.CSSProperties = {
      transform: `translateY(${pullDistance}px)`,
      transition: refreshState === 'idle' ? 'transform 0.2s ease-out' : 'none',
    };

    // 物理效果类名
    const physicsClass =
      physics === 'bouncing'
        ? styles.bouncingPhysics
        : physics === 'clamping'
          ? styles.clampingPhysics
          : '';

    return (
      <ScrollContext.Provider value={contextValue}>
        <div
          ref={containerRef}
          className={`${styles.pageScrollView} ${physicsClass} ${reverse ? styles.reverse : ''} ${className}`}
          style={containerStyle}
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* 下拉刷新指示器 */}
          {refreshable && (
            <div
              className={styles.pageRefreshIndicator}
              style={{
                height: `${pullDistance}px`,
                opacity: pullDistance > 0 ? 1 : 0,
              }}
            >
              <div className={styles.pageRefreshContent}>
                {refreshState === 'refreshing' ? (
                  <>
                    <SpinLoading />
                    <span>刷新中...</span>
                  </>
                ) : refreshState === 'ready' ? (
                  <span>释放刷新</span>
                ) : (
                  <span>下拉刷新</span>
                )}
              </div>
            </div>
          )}

          {/* 内容区域 */}
          <div
            ref={contentRef}
            className={styles.pageScrollContent}
            style={contentStyle}
          >
            {children}
          </div>

          {/* 上拉加载指示器 */}
          {loadMoreable && (
            <div className={styles.pageLoadMoreIndicator}>
              {loading && (
                <div className={styles.pageLoadingContent}>
                  <SpinLoading />
                  <span>加载中...</span>
                </div>
              )}
              {!hasMore && !loading && (
                <div className={styles.pageNoMoreContent}>没有更多了</div>
              )}
            </div>
          )}
        </div>
      </ScrollContext.Provider>
    );
  },
);

PageScrollView.displayName = 'PageScrollView';
