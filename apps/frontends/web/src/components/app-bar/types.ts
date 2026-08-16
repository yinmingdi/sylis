import type React from 'react';

// ========== ActionItem ==========
export interface ActionItem {
  icon: React.ReactNode;
  onClick: () => void;
  key?: string;
}

// ========== AppBar Props ==========
export interface AppBarProps {
  title?: string;
  leading?: React.ReactNode;
  actions?: React.ReactNode | ActionItem[];
  bottom?: React.ReactNode;
  backgroundColor?: string;
  elevation?: boolean;
  centerTitle?: boolean;
  height?: number;
  automaticallyImplyLeading?: boolean;
  flexibleSpace?: React.ReactNode;
  className?: string;
  onBack?: () => void;
  children?: React.ReactNode; // 自定义标题区域内容
}
