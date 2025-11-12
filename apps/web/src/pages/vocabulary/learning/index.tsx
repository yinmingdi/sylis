import NiceModal from '@ebay/nice-modal-react';
import type { GetCurrentBookResDto } from '@sylis/shared/dto';
import { Card, ProgressBar, Button, Skeleton, Grid } from 'antd-mobile';
import { useEffect, useState } from 'react';
import {
  AiFillMacCommand,
  AiOutlineRight,
  AiOutlineBook,
  AiOutlineBarChart,
  AiOutlineClockCircle,
  AiOutlineFire,
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import { WordSearch } from '../../../components';
import { AppBar } from '../../../components/app-bar';
import { PageView } from '../../../components/view';
import { getCurrentBook, getNewWords, getReviewWords } from '../../../modules/books/api';
import { getLearningStats } from '../../../modules/learning/api';

const WordPage = () => {
  const [data, setData] = useState<GetCurrentBookResDto | null>(null);
  const [stats, setStats] = useState<{
    checkInDays: number;
    learningProgress: number;
    newWordsLearned: number;
    reviewWords: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [newWordsLoading, setNewWordsLoading] = useState(false);
  const [reviewWordsLoading, setReviewWordsLoading] = useState(false);
  const navigate = useNavigate();

  const init = async () => {
    try {
      const [bookRes, statsRes] = await Promise.all([
        getCurrentBook(),
        getLearningStats()
      ]);

      setData(bookRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLearnNewWords = async () => {
    if (!data?.book?.id) return;

    setNewWordsLoading(true);
    try {
      const res = await getNewWords({
        bookId: data.book.id
      });
      console.log('New words:', res);
      navigate(`/vocabulary-practice?bookId=${data.book.id}&type=new`);
    } catch (error) {
      console.error('Failed to get new words:', error);
    } finally {
      setNewWordsLoading(false);
    }
  };

  const handleReviewWords = async () => {
    if (!data?.book?.id) return;

    setReviewWordsLoading(true);
    try {
      const res = await getReviewWords({
        bookId: data.book.id
      });
      console.log('Review words:', res);
      navigate(`/vocabulary-practice?bookId=${data.book.id}&type=review`);
    } catch (error) {
      console.error('Failed to get review words:', error);
    } finally {
      setReviewWordsLoading(false);
    }
  };

  const handleSearchClick = () => {
    NiceModal.show(WordSearch);
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

  const renderBookCover = () => (
    <div className={styles.bookCover}>
      <AiOutlineBook />
    </div>
  );

  const renderBookTitle = () => (
    <div className={styles.bookTitleWrapper}>
      <div
        className={styles.bookTitle}
        onClick={() => data?.book && navigate(`/book-detail/${data.book.id}`)}
      >
        {data?.book?.name}
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
  );

  const renderBookProgress = () => (
    <>
      <div className={styles.bookMeta}>
        <span>{learnedWords}/{data?.totalWords ?? 0}词</span>
        <span className={styles.bookTag}>进度 {data?.progress ?? 0}%</span>
      </div>
      <ProgressBar
        percent={data?.progress || 0}
        className={styles.bookProgressBar}
      />
    </>
  );

  const renderBookContent = () => (
    <div className={styles.bookContent}>
      {renderBookCover()}
      <div className={styles.bookInfo}>
        {renderBookTitle()}
        {renderBookProgress()}
      </div>
    </div>
  );

  const renderEmptyBookState = () => (
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
  );

  const renderBookCard = () => (
    <div className={styles.bookSection}>
      <Card className={styles.bookCard}>

        {loading ? (
          <Skeleton.Paragraph className={styles.bookCardSkeleton} lineCount={3} animated />
        ) : data?.book ? (
          renderBookContent()
        ) : (
          renderEmptyBookState()
        )}
      </Card>
    </div>
  );

  return (
    <PageView
      className={styles.wordPage}
      appBar={
        <AppBar automaticallyImplyLeading={false} >
          <div className={styles.searchBarWrap} onClick={handleSearchClick}>
            <AiFillMacCommand className={styles.searchIcon} />
            <span className={styles.searchPlaceholder}>输入中英文 | 查词、翻译、润色...</span>
          </div>
        </AppBar>
      }
    >
      {renderBookCard()}

      <div className={styles.buttonGroup}>
        <Button
          color="primary"
          block
          size="large"
          className={styles.learningButton}
          onClick={handleLearnNewWords}
          disabled={!data?.book?.id}
          loading={newWordsLoading}
        >
          学习新单词
        </Button>
        <Button
          fill="outline"
          block
          size="large"
          className={styles.learningButton}
          onClick={handleReviewWords}
          disabled={!data?.book?.id}
          loading={reviewWordsLoading}
        >
          复习单词
        </Button>
      </div>

      {renderStats()}
    </PageView>
  );
};

export default WordPage;
