import { Card } from 'antd-mobile';
import { AiOutlineHistory, AiOutlineCheckCircle } from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import { AppBar } from '../../../components/app-bar';
import { PageView } from '../../../components/view';

const VocabularyTest = () => {
  const navigate = useNavigate();

  return (
    <PageView
      className={styles.testPage}
      appBar={
        <AppBar title="词汇量测试" onBack={() => navigate('/me')} />
      }
    >
      <div className={styles.content}>
        <div className={styles.mainSection}>
          <div className={styles.description}>
            <p>通过科学的测试方法，准确评估你的英语词汇水平</p>
          </div>

          <Card className={styles.entryCard} onClick={() => navigate('/vocabulary-test-exam')}>
            <div className={styles.entryContent}>
              <div className={styles.entryIcon}>
                <AiOutlineCheckCircle />
              </div>
              <div className={styles.entryInfo}>
                <h3>开始测试</h3>
                <p>10道选择题，评估你的词汇水平</p>
              </div>
            </div>
          </Card>

          <Card className={styles.entryCard} onClick={() => navigate('/vocabulary-test-history')}>
            <div className={styles.entryContent}>
              <div className={styles.entryIcon}>
                <AiOutlineHistory />
              </div>
              <div className={styles.entryInfo}>
                <h3>测试历史</h3>
                <p>查看历史成绩和进步曲线</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </PageView>
  );
};

export default VocabularyTest;
