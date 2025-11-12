import React from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import { PageView } from '../../../components/view';

const ExplorePage: React.FC = () => {
  const navigate = useNavigate();

  const platforms = [
    {
      id: 'reddit',
      name: 'Reddit',
      description: '浏览全球热门话题，在真实英语社区中学习',
      logo: 'https://www.redditstatic.com/desktop2x/img/favicon/favicon-32x32.png',
      color: '#ff4500',
      disabled: false,
      onClick: () => navigate('/reddit')
    },
    {
      id: 'x',
      name: 'X',
      description: '关注实时热点动态，提升英语表达能力',
      logo: 'https://abs.twimg.com/favicons/twitter.3.ico',
      color: '#000000',
      disabled: true,
      onClick: () => { }
    },
    {
      id: 'quora',
      name: 'Quora',
      description: '探索高质量问答，深度学习地道英语',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Quora_logo_2015.svg',
      color: '#b92b27',
      disabled: true,
      onClick: () => { }
    },
    {
      id: 'medium',
      name: 'Medium',
      description: '阅读优质长文，拓展英语阅读视野',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Medium_logo_Monogram.svg',
      color: '#000000',
      disabled: true,
      onClick: () => { }
    }
  ];

  return (
    <PageView className={styles.explorePage}>
      <div className={styles.hero}>
        <h1>探索英语世界</h1>
        <p>在真实场景中沉浸式学习英语</p>
      </div>

      <div className={styles.platforms}>
        {platforms.map((platform) => (
          <div
            key={platform.id}
            className={`${styles.platformCard} ${platform.disabled ? styles.disabled : ''}`}
            onClick={platform.disabled ? undefined : platform.onClick}
          >
            <div className={styles.logoWrapper}>
              <img src={platform.logo} alt={platform.name} className={styles.logo} />
            </div>
            <div className={styles.cardContent}>
              <h3>
                {platform.name}
                {platform.disabled && (
                  <span className={styles.comingSoon}>即将上线</span>
                )}
              </h3>
              <p>{platform.description}</p>
            </div>
          </div>
        ))}
      </div>
    </PageView>
  );
};

export default ExplorePage;

