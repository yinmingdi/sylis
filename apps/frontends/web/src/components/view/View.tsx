import React from 'react';

import styles from './index.module.less';
import type { ViewProps } from './types';

export const PageView: React.FC<ViewProps> = ({
  appBar,
  children,
  bottomNavigationBar,
  floatingActionButton,
  backgroundColor,
  resizeToAvoidBottomInset = true,
  extendBody = false,
  extendBodyBehindAppBar = false,
  className = '',
  bodyClassName = '',
  bodyStyle,
}) => {
  const containerStyle: React.CSSProperties = {
    backgroundColor,
  };

  return (
    <div
      className={`${styles.pageView} ${resizeToAvoidBottomInset ? styles.resizeToAvoidKeyboard : ''} ${className}`}
      style={containerStyle}
    >
      {/* AppBar */}
      {appBar && !extendBodyBehindAppBar && (
        <div className={styles.pageViewAppBar}>{appBar}</div>
      )}

      {/* Children */}
      <div
        className={`${styles.pageViewBody} ${bodyClassName} ${extendBodyBehindAppBar ? styles.extendBehindAppBar : ''} ${extendBody ? styles.extendBody : ''}`}
        style={bodyStyle}
      >
        {extendBodyBehindAppBar && appBar && (
          <div className={styles.pageViewAppBarOverlay}>{appBar}</div>
        )}
        {children}
      </div>

      {/* Bottom Navigation Bar */}
      {bottomNavigationBar && !extendBody && (
        <div className={styles.pageViewBottomNav}>{bottomNavigationBar}</div>
      )}

      {/* Floating Action Button */}
      {floatingActionButton && (
        <div className={styles.pageViewFab}>{floatingActionButton}</div>
      )}

      {/* Bottom Navigation Bar (extended) */}
      {bottomNavigationBar && extendBody && (
        <div className={styles.pageViewBottomNavOverlay}>
          {bottomNavigationBar}
        </div>
      )}
    </div>
  );
};
