import { show } from '@ebay/nice-modal-react';
import React from 'react';
import { AiOutlineBook, AiOutlineEdit, AiOutlineRobot, AiOutlineArrowRight, AiOutlineFileText, AiOutlineUnorderedList } from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import { ArticleGenerationModal } from '../../../components/article-generator/ArticleGenerationModal';
import { PageView } from '../../../components/view';

const AiPage: React.FC = () => {
  const navigate = useNavigate();

  // 处理弹窗打开
  const handleOpenModal = (type: 'story' | 'cloze') => {
    show(ArticleGenerationModal, {
      title: type === 'story' ? '故事阅读' : '填空阅读',
      description: type === 'story' ? '在生动故事中自然记忆单词' : '在语境中提升理解能力',
      onComplete: (articleId: string) => {
        if (type === 'story') {
          navigate(`/articles/${articleId}`);
        } else {
          navigate(`/cloze-reading/${articleId}`);
        }
      },
    });
  };


  const aiFeatures = [
    {
      id: 'story-reading',
      title: '故事阅读',
      description: '在生动故事中自然记忆单词',
      icon: <AiOutlineBook />,
      color: '#667eea',
      onClick: () => handleOpenModal('story')
    },
    {
      id: 'cloze-reading',
      title: '填空阅读',
      description: '在语境中提升理解能力',
      icon: <AiOutlineEdit />,
      color: '#f093fb',
      onClick: () => handleOpenModal('cloze')
    },
    {
      id: 'grammar-analysis',
      title: '语法解析',
      description: '智能分析英语句子语法结构',
      icon: <AiOutlineFileText />,
      color: '#ff6b6b',
      onClick: () => navigate('/grammar-analysis')
    },
    {
      id: 'ai-chat',
      title: 'AI对话',
      description: '与AI自然对话练习口语',
      icon: <AiOutlineRobot />,
      color: '#4facfe',
      onClick: () => navigate('/chat')
    },
    {
      id: 'articles',
      title: '我的文章',
      description: '查看和管理生成的文章',
      icon: <AiOutlineUnorderedList />,
      color: '#51cf66',
      onClick: () => navigate('/articles')
    }
  ];

  return (
    <PageView className={styles.aiPage}>
      <div className={styles.hero}>
        <h1>智能学习，事半功倍</h1>
        <p>AI技术为您量身定制学习方案</p>
      </div>

      <div className={styles.features}>
        {aiFeatures.map((feature) => (
          <div
            key={feature.id}
            className={styles.featureCard}
            onClick={feature.onClick}
          >
            <div
              className={styles.iconWrapper}
              style={{ color: feature.color }}
            >
              {feature.icon}
            </div>
            <div className={styles.cardContent}>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
            <AiOutlineArrowRight className={styles.arrow} />
          </div>
        ))}
      </div>
    </PageView>
  );
};

export default AiPage;
