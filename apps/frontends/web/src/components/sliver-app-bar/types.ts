import type { AppBarProps } from '../app-bar';

// ========== SliverAppBar Props ==========
export interface SliverAppBarProps extends Omit<AppBarProps, 'className'> {
  expandedHeight?: number;
  collapsedHeight?: number;
  pinned?: boolean;
  floating?: boolean;
  snap?: boolean;
  stretch?: boolean;
  foregroundColor?: string;
  className?: string;
}
