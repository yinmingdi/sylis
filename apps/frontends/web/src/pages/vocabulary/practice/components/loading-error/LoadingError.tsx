import React from 'react';

import styles from './index.module.less';

interface LoadingErrorProps {
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}

const LoadingError: React.FC<LoadingErrorProps> = ({
  loading,
  error,
  onRetry,
}) => {
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <div className={styles.loadingText}>加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorIcon}>⚠️</div>
        <div className={styles.errorTitle}>加载失败</div>
        <div className={styles.errorMessage}>{error}</div>
        {onRetry && (
          <button className={styles.retryButton} onClick={onRetry}>
            重试
          </button>
        )}
      </div>
    );
  }

  return null;
};

export default LoadingError;
