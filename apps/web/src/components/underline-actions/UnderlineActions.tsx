import React from 'react';

import styles from './index.module.less';
import { Button } from '../button';

export interface UnderlineAction {
    /** 按钮文字内容 */
    label: string;
    /** 点击事件 */
    onClick: () => void;
    /** 下划线颜色 */
    underlineColor?: string;
}

interface UnderlineActionsProps {
    /** 按钮列表 */
    actions: UnderlineAction[];
}

const UnderlineActions: React.FC<UnderlineActionsProps> = ({ actions }) => {
    return (
        <div className={styles.underlineActions}>
            {actions.map((action, index) => (
                <Button
                    key={index}
                    variant="underline"
                    underlineColor={action.underlineColor}
                    onClick={action.onClick}
                >
                    {action.label}
                </Button>
            ))}
        </div>
    );
};

export default UnderlineActions;

