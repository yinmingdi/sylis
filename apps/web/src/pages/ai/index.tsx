import React from 'react';
import { AiOutlineBook, AiOutlineEdit, AiOutlineRobot, AiOutlineArrowRight, AiOutlineFileText } from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';

const AiPage: React.FC = () => {
  const navigate = useNavigate();

  const aiFeatures = [
    {
      id: 'story-vocabulary',
      title: '故事背单词',
      description: '在生动故事中自然记忆单词',
      icon: <AiOutlineBook />,
      color: '#667eea',
      onClick: () => navigate('/story-vocabulary')
    },
    {
      id: 'cloze-test',
      title: '短文填词',
      description: '在语境中提升理解能力',
      icon: <AiOutlineEdit />,
      color: '#f093fb',
      onClick: () => navigate('/cloze-test')
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
    }
  ];

  return (
    <div className={styles.aiPage}>
      <div className={styles.content}>
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
      </div>
    </div>
  );
};

export default AiPage;
