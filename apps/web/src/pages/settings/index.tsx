import { Switch, Grid } from 'antd-mobile';
import React from 'react';
import {
    AiOutlineLeft,
    AiOutlineMoon,
    AiOutlineSun,
    AiOutlineCheck,
    AiOutlineEye,
    AiOutlineBgColors
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import PageHeader from '../../components/page-header';
import { useTheme } from '../../hooks/useTheme';

interface ThemeColor {
    name: string;
    color: string;
    value: string;
}

const Settings: React.FC = () => {
    const navigate = useNavigate();
    const { theme, toggleTheme, primaryColor, setPrimaryColor } = useTheme();

    // 主题色选项
    const themeColors: ThemeColor[] = [
        { name: '科技蓝', color: '#2ec4b6', value: 'blue' },
        { name: '活力橙', color: '#ff9f1c', value: 'orange' },
        { name: '自然绿', color: '#06d6a0', value: 'green' },
        { name: '优雅紫', color: '#722ed1', value: 'purple' },
        { name: '温馨粉', color: '#f71735', value: 'pink' },
        { name: '深海青', color: '#13c2c2', value: 'cyan' }
    ];

    const settingsItems = [
        {
            id: 'dark-mode',
            title: '深色模式',
            description: '切换深色或浅色主题',
            icon: theme === 'dark' ? <AiOutlineMoon /> : <AiOutlineSun />,
            color: '#ff9f1c',
            type: 'switch' as const,
            value: theme === 'dark',
            onChange: toggleTheme
        },
        {
            id: 'theme-colors',
            title: '主题色彩',
            description: '个性化您的界面颜色',
            icon: <AiOutlineBgColors />,
            color: '#2ec4b6',
            type: 'color' as const
        },
        {
            id: 'preview',
            title: '预览效果',
            description: '查看当前主题效果',
            icon: <AiOutlineEye />,
            color: '#f71735',
            type: 'preview' as const
        }
    ];

    const renderSettingCard = (item: typeof settingsItems[0]) => {
        if (item.type === 'switch') {
            return (
                <div key={item.id} className={styles.settingCard}>
                    <div
                        className={styles.iconWrapper}
                        style={{ color: item.color }}
                    >
                        {item.icon}
                    </div>
                    <div className={styles.cardContent}>
                        <h4>{item.title}</h4>
                        <p>{item.description}</p>
                    </div>
                    <Switch
                        checked={item.value}
                        onChange={item.onChange}
                        className={styles.switch}
                    />
                </div>
            );
        }

        return (
            <div key={item.id} className={styles.settingCard}>
                <div
                    className={styles.iconWrapper}
                    style={{ color: item.color }}
                >
                    {item.icon}
                </div>
                <div className={styles.cardContent}>
                    <h4>{item.title}</h4>
                    <p>{item.description}</p>
                </div>
            </div>
        );
    };

    const renderColorSettings = () => (
        <div className={styles.colorSection}>
            <h3 className={styles.sectionTitle}>主题色彩</h3>
            <Grid columns={3} gap={12}>
                {themeColors.map((colorOption, index) => (
                    <Grid.Item key={index}>
                        <div
                            className={`${styles.colorCard} ${primaryColor === colorOption.value ? styles.active : ''}`}
                            onClick={() => setPrimaryColor(colorOption.value as any)}
                        >
                            <div
                                className={styles.colorCircle}
                                style={{ backgroundColor: colorOption.color }}
                            >
                                {primaryColor === colorOption.value && (
                                    <AiOutlineCheck className={styles.checkIcon} />
                                )}
                            </div>
                            <span className={styles.colorName}>{colorOption.name}</span>
                        </div>
                    </Grid.Item>
                ))}
            </Grid>
        </div>
    );

    const renderPreview = () => {
        const currentColor = themeColors.find(c => c.value === primaryColor)?.color || '#2ec4b6';

        return (
            <div className={styles.previewSection}>
                <h3 className={styles.sectionTitle}>预览效果</h3>
                <div className={styles.previewCard}>
                    <div className={styles.previewHeader}>
                        <div className={styles.previewTitle}>示例卡片</div>
                        <div
                            className={styles.previewAccent}
                            style={{ backgroundColor: currentColor }}
                        />
                    </div>
                    <div className={styles.previewContent}>
                        <p>这是一个预览示例，展示当前主题色的效果。</p>
                        <div
                            className={styles.previewButton}
                            style={{ backgroundColor: currentColor }}
                        >
                            预览按钮
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={styles.settingsPage}>
            <PageHeader
                title="个性化设置"
                onBack={() => navigate(-1)}
                leftIcon={<AiOutlineLeft />}
            />

            <div className={styles.content}>
                <div className={styles.settingsSection}>
                    <h3 className={styles.sectionTitle}>外观设置</h3>
                    <div className={styles.settingsList}>
                        {settingsItems.map(item =>
                            item.type !== 'color' && item.type !== 'preview' && renderSettingCard(item)
                        )}
                    </div>
                </div>

                {renderColorSettings()}
                {renderPreview()}
            </div>
        </div>
    );
};

export default Settings;
