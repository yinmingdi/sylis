import type React from 'react';

import type { AppBarProps } from '../app-bar';

// ========== View Props ==========
export interface ViewProps {
  appBar?: React.ReactElement<AppBarProps>;
  children: React.ReactNode;
  bottomNavigationBar?: React.ReactNode;
  floatingActionButton?: React.ReactNode;
  backgroundColor?: string;
  resizeToAvoidBottomInset?: boolean;
  extendBody?: boolean;
  extendBodyBehindAppBar?: boolean;
  className?: string;
  bodyClassName?: string;
  bodyStyle?: React.CSSProperties;
}
