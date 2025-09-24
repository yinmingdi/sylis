import type { GetCurrentBookResDto } from '@sylis/shared/dto';
import { Card, ProgressBar, Button, Skeleton, Grid } from 'antd-mobile';
import { useEffect, useState } from 'react';
import {
  AiFillMacCommand,
  AiOutlineArrowRight,
  AiOutlineRight,
  AiOutlineBook,
  AiOutlineBarChart,
  AiOutlineClockCircle,
  AiOutlineFire
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import PageHeader from '../../components/page-header';
import { getCurrentBook, getDailyPlan } from '../../modules/books/api';
import { getLearningStats } from '../../network/learning';

const WordPage = () => {
  const [data, setData] = useState<GetCurrentBookResDto | null>(null);
  const [stats, setStats] = useState<{
    checkInDays: number;
    learningProgress: number;
    newWordsLearned: number;
    reviewWords: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const init = async () => {
    try {
      const [bookRes, statsRes] = await Promise.all([
        getCurrentBook(),
        getLearningStats()
      ]);

      setData(bookRes.data);
      setStats(statsRes.data);

      // 如果有当前书籍，获取每日计划
      if (bookRes.data.book) {
        const planRes = await getDailyPlan({
          bookId: bookRes.data.book.id
        });
        console.log(planRes);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    init();
  }, []);

  // 使用API返回的真实统计数据
  const punchDays = stats?.checkInDays ?? 0;
  const newWords = stats?.newWordsLearned ?? 0;
  const reviewWords = stats?.reviewWords ?? 0;
  const learnedWords = Math.floor((data?.progress ?? 0) * (data?.totalWords ?? 0) / 100);

  const renderStats = () => (
    <div className={styles.statsSection}>
      <h3 className={styles.sectionTitle}>学习统计</h3>
      <Grid columns={2} gap={12}>
        <Grid.Item>
          <div className={styles.statCard}>
            <AiOutlineFire className={styles.statIcon} style={{ color: '#f71735' }} />
            <div className={styles.statContent}>
              <div className={styles.statValue}>{punchDays}</div>
              <div className={styles.statLabel}>打卡天数</div>
            </div>
          </div>
        </Grid.Item>
        <Grid.Item>
          <div className={styles.statCard}>
            <AiOutlineBarChart className={styles.statIcon} style={{ color: '#2ec4b6' }} />
            <div className={styles.statContent}>
              <div className={styles.statValue}>{data?.progress ?? 0}%</div>
              <div className={styles.statLabel}>学习进度</div>
            </div>
          </div>
        </Grid.Item>
        <Grid.Item>
          <div className={styles.statCard}>
            <AiOutlineBook className={styles.statIcon} style={{ color: '#ff9f1c' }} />
            <div className={styles.statContent}>
              <div className={styles.statValue}>{newWords}</div>
              <div className={styles.statLabel}>新学词</div>
            </div>
          </div>
        </Grid.Item>
        <Grid.Item>
          <div className={styles.statCard}>
            <AiOutlineClockCircle className={styles.statIcon} style={{ color: '#06d6a0' }} />
            <div className={styles.statContent}>
              <div className={styles.statValue}>{reviewWords}</div>
              <div className={styles.statLabel}>复习词</div>
            </div>
          </div>
        </Grid.Item>
      </Grid>
    </div>
  );

  const renderBookCard = () => (
    <div className={styles.bookSection}>

      <Card className={styles.bookCard}>
        {loading ? (
          <Skeleton.Paragraph lineCount={3} animated />
        ) : data?.book ? (
          <div className={styles.bookContent}>
            <div className={styles.bookCover}>
              <AiOutlineBook />
            </div>
            <div className={styles.bookInfo}>
              <div className={styles.bookTitleWrapper}>
                <div
                  className={styles.bookTitle}
                  onClick={() => data.book && navigate(`/book-detail/${data.book.id}`)}
                >
                  {data.book.name}
                  <AiOutlineRight className={styles.bookTitleArrow} />
                </div>
                <Button
                  size="mini"
                  fill="none"
                  className={styles.bookTextButton}
                  onClick={() => navigate('/books')}
                >
                  切换词书
                </Button>
              </div>
              <div className={styles.bookMeta}>
                <span>{learnedWords}/{data.totalWords ?? 0}词</span>
                <span className={styles.bookTag}>进度 {data.progress ?? 0}%</span>
              </div>
              <ProgressBar
                percent={data.progress || 0}
                className={styles.bookProgressBar}
              />
            </div>
          </div>
        ) : (
          <div className={styles.emptyBookState}>
            <AiOutlineBook className={styles.emptyIcon} />
            <p>暂未选择词书</p>
            <Button
              color="primary"
              size="small"
              onClick={() => navigate('/books')}
            >
              选择词书
            </Button>
          </div>
        )}
      </Card>
    </div>
  );

  return (
    <div className={styles.wordPage}>
      <PageHeader
        title="单词学习"
        showBack={false}
      // actions={
      //   <Badge content={<span className={styles.headerDot} />} style={{ '--right': '2px', '--top': '2px' }}>
      //     <AiOutlineBell className={styles.headerBell} />
      //   </Badge>
      // }
      >
        <div className={styles.searchBarWrap}>
          <AiFillMacCommand className={styles.searchIcon} />
          <span className={styles.searchPlaceholder}>输入中英文 | 查词、翻译、润色...</span>
        </div>
      </PageHeader>
      <div className={styles.content}>
        {renderBookCard()}
        <Button
          color="primary"
          block
          size="large"
          className={styles.startButton}
          onClick={() => {
            if (data?.book?.id) {
              console.log('Navigating to vocabulary-practice with bookId:', data.book.id);
              navigate(`/vocabulary-practice?bookId=${data.book.id}`);
            }
          }}
          disabled={!data?.book?.id}
        >
          <AiOutlineArrowRight style={{ marginRight: 8, fontSize: 18 }} />
          开始学习
        </Button>

        {renderStats()}
      </div>
    </div>
  );
};

export default WordPage;
