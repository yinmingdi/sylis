import React from 'react';
import { AiOutlineSun, AiOutlineMoon, AiOutlineEye } from 'react-icons/ai';

import styles from './index.module.less';
import { useTheme } from '../../hooks/useTheme';

const ThemeToggle: React.FC = () => {
    const { theme, resolvedTheme, toggleTheme, isAuto } = useTheme();

    const getIcon = () => {
        if (isAuto) {
            return <AiOutlineEye className={styles.icon} />;
        }
        return resolvedTheme === 'dark' ?
            <AiOutlineMoon className={styles.icon} /> :
            <AiOutlineSun className={styles.icon} />;
    };

    const getLabel = () => {
        switch (theme) {
            case 'light': return '浅色';
            case 'dark': return '深色';
            case 'auto': return '跟随系统';
            default: return '浅色';
        }
    };

    return (
        <button
            className={styles.themeToggle}
            onClick={toggleTheme}
            aria-label={`切换主题 - 当前: ${getLabel()}`}
            title={`当前主题: ${getLabel()}`}
        >
            {getIcon()}
            <span className={styles.label}>{getLabel()}</span>
        </button>
    );
};

export default ThemeToggle;
