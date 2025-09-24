import type { BookDetailResDto } from '@sylis/shared/dto';
import type { AddBookReqDto } from '@sylis/shared/dto';
import { PickerView, Toast } from 'antd-mobile';
import { useEffect, useState } from 'react';
import {
  AiOutlineBook,
  AiOutlineArrowRight,
  AiOutlineCalendar,
  AiOutlineFileText,
  AiOutlineUser,
} from 'react-icons/ai';
import { useParams, useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import PageHeader from '../../components/page-header';
import { addLearningBook, getBookDetail } from '../../modules/books/api';

const NEW_WORDS_OPTIONS = [5, 10, 15, 20, 25];
const REVIEW_WORDS_OPTIONS = [15, 30, 45, 60, 75];

function calcFinishDate(total: number, newNum: number) {
  const days = Math.ceil(total / newNum);
  const now = new Date();
  now.setDate(now.getDate() + days);
  return { days, date: now };
}

// 词书详情卡片
function BookDetailCard({ book }: { book: BookDetailResDto }) {
  return (
    <div className={styles.bookDetailCard}>
      <div className={styles.bookHeader}>
        <div className={styles.coverWrapper}>
          {book.coverUrl ? (
            <img src={book.coverUrl} alt={book.name} className={styles.bookCover} />
          ) : (
            <div className={styles.defaultCover}>
              <AiOutlineBook />
            </div>
          )}
        </div>
        <div className={styles.bookInfo}>
          <h1 className={styles.bookTitle}>{book.name}</h1>
          {book.introduce && (
            <p className={styles.bookIntro}>{book.introduce}</p>
          )}
          <div className={styles.bookMeta}>
            <div className={styles.metaItem}>
              <AiOutlineFileText className={styles.metaIcon} />
              <span className={styles.metaText}>{book.wordNum} 词</span>
            </div>
            <div className={styles.metaItem}>
              <AiOutlineUser className={styles.metaIcon} />
              <span className={styles.metaText}>1.2K 学习</span>
            </div>

          </div>

        </div>

      </div>

      {book.tags && book.tags.length > 0 && (
        <div className={styles.tagsSection}>
          {book.tags.map((tag: string) => (
            <span className={styles.bookTag} key={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// 学习计划设置区域
function LearningPlanCard({
  pickerValue,
  setPickerValue,
  finishDateStr,
  bookId,
}: {
  total: number;
  pickerValue: [number, number];
  setPickerValue: (val: [number, number]) => void;
  finishDateStr: string;
  bookId: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const columns = [
    NEW_WORDS_OPTIONS.map((v) => ({ label: `新词 ${v}`, value: v })),
    REVIEW_WORDS_OPTIONS.map((v) => ({ label: `复习 ${v}`, value: v })),
  ];

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const payload: AddBookReqDto = {
        bookId,
        dailyNewWords: pickerValue[0],
        dailyReviewWords: pickerValue[1],
      };
      await addLearningBook(payload);
      // Toast.show({
      //     icon: 'success',
      //     content: '学习计划设置成功！',
      // });
      // 延迟跳转，让用户看到成功提示
      // setTimeout(() => {
      //     navigate('/vocabulary-practice');
      // }, 1500);
      navigate('/vocabulary-learning');
    } catch (error: any) {
      console.log(error);
      Toast.show({
        icon: 'fail',
        content: '设置失败，请重试',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.learningPlanCard}>

      <div className={styles.estimateCard}>
        <div className={styles.estimateHeader}>
          <AiOutlineCalendar className={styles.estimateIcon} />
          <span>预计完成时间</span>
        </div>
        <div className={styles.estimateDate}>{finishDateStr}</div>
      </div>
      <div className={styles.pickerSection}>
        <h3 className={styles.pickerTitle}>调整学习任务量</h3>
        <div className={styles.pickerContainer}>
          <PickerView
            columns={columns}
            value={pickerValue}
            onChange={val => setPickerValue(val as [number, number])}
            className={styles.customPicker}
          />
        </div>
      </div>


      <button
        className={styles.confirmButton}
        onClick={handleConfirm}
        disabled={isLoading}
      >
        {isLoading ? (
          <div className={styles.loadingContent}>
            <div className={styles.spinner} />
            <span>设置中...</span>
          </div>
        ) : (
          <div className={styles.buttonContent}>
            <span>开始学习</span>
            <AiOutlineArrowRight className={styles.arrowIcon} />
          </div>
        )}
      </button>
    </div>
  );
}

const BookDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<BookDetailResDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerValue, setPickerValue] = useState<[number, number]>([10, 30]); // 默认10/30
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;

    getBookDetail(id)
      .then((res) => {
        setBook(res.data);
        // 如果有用户学习设置，使用其中的值
        if (res.data.userBook) {
          setPickerValue([
            res.data.userBook.dailyNewWords,
            res.data.userBook.dailyReviewWords,
          ]);
        }
      })
      .catch((error) => {
        console.error('获取书籍详情失败:', error);
        Toast.show({
          icon: 'fail',
          content: '获取书籍详情失败',
        });
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className={styles.loading}>加载中...</div>;
  if (!book) return <div className={styles.empty}>未找到该词书</div>;

  const total = book.wordNum || 0;
  const [newNum] = pickerValue;
  const { date } = calcFinishDate(total, newNum);
  const finishDateStr = `${date.getFullYear()}年${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}月${date.getDate().toString().padStart(2, '0')}日`;

  return (
    <div className={styles.bookDetailPage}>
      <PageHeader
        title="学习计划"
        onBack={() => navigate(-1)}
        showBack={true}
      />
      <div className={styles.pageContent}>
        <BookDetailCard book={book} />
        <LearningPlanCard
          total={total}
          pickerValue={pickerValue}
          setPickerValue={setPickerValue}
          finishDateStr={finishDateStr}
          bookId={book.id}
        />
      </div>
    </div>
  );
};

export default BookDetail;



