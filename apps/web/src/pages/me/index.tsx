import { Avatar, ProgressBar, Grid, Toast } from 'antd-mobile';
import { useEffect, useState } from 'react';
import {
  AiOutlineBook,
  AiOutlineEdit,
  AiOutlineBarChart,
  AiOutlineSetting,
  AiOutlineQuestionCircle,
  AiOutlineRight,
  AiOutlineFire,
  AiOutlineStar,
  AiOutlineHeart,
  AiOutlineLock,
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import { getLearningStats, getTodayProgress, type LearningStats } from '../../network/learning';

const Me = () => {
  const navigate = useNavigate();

  // 状态管理
  const [loading, setLoading] = useState(true);
  const [learningStats, setLearningStats] = useState<LearningStats>({
    checkInDays: 0,
    learningProgress: 0,
    newWordsLearned: 0,
    reviewWords: 0,
  });
  const [todayProgress, setTodayProgress] = useState<{ completed: number; total: number }>({
    completed: 0,
    total: 0,
  });

  // 模拟用户数据
  const userInfo = {
    nickname: '科幻迷的小日子',
    avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b776?w=150&h=150&fit=crop&crop=face&fm=jpg',
    level: '初级学习者',
    hasVip: true
  };

  // 获取学习数据
  const fetchLearningData = async () => {
    try {
      setLoading(true);
      const [statsResponse, progressResponse] = await Promise.all([
        getLearningStats(),
        getTodayProgress(),
      ]);

      setLearningStats(statsResponse.data);
      setTodayProgress(progressResponse.data);
    } catch (error) {
      console.error('获取学习数据失败:', error);
      Toast.show('获取学习数据失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLearningData();
  }, []);

  const renderUserProfile = () => (
    <div className={styles.profileSection}>
      <div className={styles.profileCard} onClick={() => navigate('/profile')}>
        <div className={styles.profileContent}>
          <div className={styles.avatarContainer}>
            <Avatar
              src={userInfo.avatar}
              className={styles.avatar}
            />
            {userInfo.hasVip && (
              <div className={styles.vipBadge}>
                <AiOutlineStar />
              </div>
            )}
          </div>

          <div className={styles.userInfo}>
            <div className={styles.userBasic}>
              <h2 className={styles.nickname}>{userInfo.nickname}</h2>
              <span className={styles.levelBadge}>{userInfo.level}</span>
            </div>
          </div>

          <AiOutlineRight className={styles.profileIcon} />
        </div>
      </div>
    </div>
  );

  const renderLearningStats = () => (
    <div className={styles.statsSection}>
      <h3 className={styles.sectionTitle}>学习统计</h3>
      <Grid columns={2} gap={12}>
        <Grid.Item>
          <div className={styles.statCard}>
            <AiOutlineFire className={styles.statIcon} style={{ color: '#f71735' }} />
            <div className={styles.statContent}>
              <div className={styles.statValue}>
                {loading ? '-' : learningStats.checkInDays}
              </div>
              <div className={styles.statLabel}>打卡天数</div>
            </div>
          </div>
        </Grid.Item>
        <Grid.Item>
          <div className={styles.statCard}>
            <AiOutlineBarChart className={styles.statIcon} style={{ color: '#2ec4b6' }} />
            <div className={styles.statContent}>
              <div className={styles.statValue}>
                {loading ? '-' : `${learningStats.learningProgress}%`}
              </div>
              <div className={styles.statLabel}>学习进度</div>
            </div>
          </div>
        </Grid.Item>
        <Grid.Item>
          <div className={styles.statCard}>
            <AiOutlineBook className={styles.statIcon} style={{ color: '#ff9f1c' }} />
            <div className={styles.statContent}>
              <div className={styles.statValue}>
                {loading ? '-' : learningStats.newWordsLearned}
              </div>
              <div className={styles.statLabel}>新学词</div>
            </div>
          </div>
        </Grid.Item>
        <Grid.Item>
          <div className={styles.statCard}>
            <AiOutlineLock className={styles.statIcon} style={{ color: '#2ec4b6' }} />
            <div className={styles.statContent}>
              <div className={styles.statValue}>
                {loading ? '-' : learningStats.reviewWords}
              </div>
              <div className={styles.statLabel}>复习词</div>
            </div>
          </div>
        </Grid.Item>
      </Grid>
    </div>
  );

  const renderTodayProgress = () => {
    const progressPercent = todayProgress.total > 0
      ? Math.round((todayProgress.completed / todayProgress.total) * 100)
      : 0;

    return (
      <div className={styles.progressSection}>
        <h3 className={styles.sectionTitle}>今日进度</h3>
        <div className={styles.progressCard}>
          <div className={styles.progressHeader}>
            <div className={styles.progressInfo}>
              <span className={styles.progressValue}>
                {loading ? '加载中...' : `${todayProgress.completed}/${todayProgress.total} 词`}
              </span>
            </div>
            <div className={styles.progressPercent}>
              {loading ? '-' : `${progressPercent}%`}
            </div>
          </div>
          <ProgressBar
            percent={loading ? 0 : progressPercent}
            className={styles.progressBar}
          />
        </div>
      </div>
    );
  };

  const renderQuickActions = () => {
    const actions = [
      {
        icon: <AiOutlineHeart />,
        label: '生词本',
        description: '复习收藏的单词',
        color: '#f71735',
        route: '/vocabulary-book'
      },
      {
        icon: <AiOutlineEdit />,
        label: '例句笔记',
        description: '查看学习笔记',
        color: '#ff9f1c',
        route: '/notes'
      },
      {
        icon: <AiOutlineBarChart />,
        label: '词汇量测试',
        description: '测试你的词汇水平',
        color: '#f71735',
        route: '/test'
      }
    ];

    return (
      <div className={styles.featuresSection}>
        <h3 className={styles.sectionTitle}>快捷功能</h3>
        <div className={styles.features}>
          {actions.map((action, index) => (
            <div
              key={index}
              className={styles.featureCard}
              onClick={() => navigate(action.route)}
            >
              <div
                className={styles.iconWrapper}
                style={{ color: action.color }}
              >
                {action.icon}
              </div>
              <div className={styles.cardContent}>
                <h4>{action.label}</h4>
                <p>{action.description}</p>
              </div>
              <AiOutlineRight className={styles.arrow} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSettingsMenu = () => {
    const menuItems = [
      {
        icon: <AiOutlineQuestionCircle />,
        label: '使用指南',
        description: '了解如何更好地使用应用',
        color: '#06d6a0',
        route: '/help'
      },
      {
        icon: <AiOutlineSetting />,
        label: '软件设置',
        description: '个性化设置和偏好',
        color: '#9d4edd',
        route: '/settings'
      }
    ];

    return (
      <div className={styles.settingsSection}>
        <h3 className={styles.sectionTitle}>设置与帮助</h3>
        <div className={styles.features}>
          {menuItems.map((item, index) => (
            <div
              key={index}
              className={styles.featureCard}
              onClick={() => navigate(item.route)}
            >
              <div
                className={styles.iconWrapper}
                style={{ color: item.color }}
              >
                {item.icon}
              </div>
              <div className={styles.cardContent}>
                <h4>{item.label}</h4>
                <p>{item.description}</p>
              </div>
              <AiOutlineRight className={styles.arrow} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.mePage}>
      <div className={styles.content}>
        <div className={styles.hero}>
          <h1>个人中心</h1>
          <p>管理学习进度和个人设置</p>
        </div>

        {renderUserProfile()}
        {renderLearningStats()}
        {renderTodayProgress()}
        {renderQuickActions()}
        {renderSettingsMenu()}
      </div>
    </div>
  );
};

export default Me;
