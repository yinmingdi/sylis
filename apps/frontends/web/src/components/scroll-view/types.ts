import type React from 'react';

// ========== ScrollView Props ==========
export interface ScrollViewProps {
  children: React.ReactNode;
  direction?: 'vertical' | 'horizontal';
  reverse?: boolean;
  physics?: 'default' | 'bouncing' | 'clamping';

  // 下拉刷新
  refreshable?: boolean;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;

  // 上拉加载
  loadMoreable?: boolean;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  loadThreshold?: number;

  // 滚动事件
  onScroll?: (event: ScrollEvent) => void;
  onScrollToTop?: () => void;
  onScrollToBottom?: () => void;

  className?: string;
  style?: React.CSSProperties;
  backgroundColor?: string;

  stickyHeaderIndices?: number[];
  scrollEventThrottle?: number;
  scrollRef?: React.RefObject<ScrollViewHandle>;
}

export interface ScrollEvent {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
  isAtTop: boolean;
  isAtBottom: boolean;
  direction: 'up' | 'down' | 'left' | 'right' | null;
}

export interface ScrollViewHandle {
  scrollTo: (options: { x?: number; y?: number; animated?: boolean }) => void;
  scrollToTop: (animated?: boolean) => void;
  scrollToBottom: (animated?: boolean) => void;
  getScrollPosition: () => { x: number; y: number };
}
