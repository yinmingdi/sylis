import React from 'react';
import { AiOutlineArrowLeft } from 'react-icons/ai';

import styles from './index.module.less';

interface PageHeaderProps {
    title: string;
    onBack?: () => void;
    actions?: React.ReactNode;
    showBack?: boolean;
    leftIcon?: React.ReactNode;
    className?: string;
    children?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    onBack,
    actions,
    showBack = true,
    leftIcon,
    className = '',
    children,
}) => {
    // 检查是否有左右区域的内容
    const hasLeftContent = showBack && onBack;
    const hasRightContent = !!actions;
    const shouldCenterTakeFullWidth = !hasLeftContent && !hasRightContent;

    return (
        <div className={`${styles.pageHeader} ${className}`}>
            {hasLeftContent && (
                <div className={styles.left}>
                    <div
                        className={styles.backIcon}
                        onClick={onBack}
                    >
                        {leftIcon || <AiOutlineArrowLeft />}
                    </div>
                </div>
            )}

            <div className={`${styles.center} ${shouldCenterTakeFullWidth ? styles.centerFullWidth : ''}`}>
                {children ? children : (
                    <div className={styles.title}>
                        {title}
                    </div>
                )}
            </div>

            {hasRightContent && (
                <div className={styles.right}>
                    {actions}
                </div>
            )}
        </div>
    );
};

export default PageHeader; 