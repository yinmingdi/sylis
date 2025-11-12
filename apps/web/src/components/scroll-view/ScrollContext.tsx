import { createContext, useContext } from 'react';

export interface SliverCallbacks {
  onScroll?: (scrollTop: number) => void;
  getHeight?: () => number;
}

export interface ScrollContextValue {
  scrollTop: number;
  scrollLeft: number;
  direction: 'up' | 'down' | 'left' | 'right' | null;
  isScrolling: boolean;
  registerSliver: (id: string, callbacks: SliverCallbacks) => () => void;
}

export const ScrollContext = createContext<ScrollContextValue | null>(null);

export const useScrollContext = () => {
  const context = useContext(ScrollContext);
  return context;
};

export const useRequiredScrollContext = () => {
  const context = useContext(ScrollContext);
  if (!context) {
    throw new Error(
      'This component must be used inside a PageScrollView. ' +
      'Wrap your component with <PageScrollView>...</PageScrollView>',
    );
  }
  return context;
};

