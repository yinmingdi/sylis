import type { GetBooksResDto } from '@sylis/shared/dto';
import { Input, Button, Modal, Form, Slider, Toast } from 'antd-mobile';
import { useEffect, useState, useMemo } from 'react';
import { AiOutlineBook, AiOutlineUser, AiOutlineTag, AiOutlineSearch } from 'react-icons/ai';

import styles from './index.module.less';
import { getBooks, addLearningBook } from '../../modules/books/api';


interface BooksProps {
  onBookSelected?: () => void; // 选书完成后的回调
  showHeader?: boolean; // 是否显示标题头部
  title?: string; // 自定义标题
}

function SearchBar({ search, setSearch }: { search: string; setSearch: (v: string) => void }) {
  return (
    <div className={styles.searchBar}>
      <AiOutlineSearch className={styles.searchIcon} />
      <Input
        className={styles.searchInput}
        type="text"
        placeholder="搜索词书名/简介"
        value={search}
        onChange={e => setSearch(e)}
      />
    </div>
  );
}

function TagTabs({ tags, activeTag, setActiveTag }: { tags: string[]; activeTag: string; setActiveTag: (t: string) => void }) {
  return (
    <div className={styles.tagTabs}>
      {tags.map(tag => (
        <span
          key={tag}
          className={tag === activeTag ? styles.activeTag : styles.tagTab}
          onClick={() => setActiveTag(tag)}
        >
          <AiOutlineTag style={{ marginRight: 2 }} />{tag}
        </span>
      ))}
    </div>
  );
}

function BookCard({ book, onClick }: { book: GetBooksResDto; onClick: () => void }) {
  return (
    <div className={styles.card} onClick={onClick} key={book.id}>
      <div className={styles.coverWrap}>
        {book.coverUrl ? (
          <img src={book.coverUrl} alt={book.name} className={styles.cover} />
        ) : (
          <AiOutlineBook className={styles.defaultCover} />
        )}
      </div>
      <div className={styles.info}>
        <div className={styles.name}>{book.name}</div>
        {book.introduce && <div className={styles.intro}>{book.introduce}</div>}
        <div className={styles.meta}>
          <span><AiOutlineBook /> {book.wordNum ?? '-'} 词</span>
          {book.reciteUserNum !== null && (
            <span><AiOutlineUser /> {book.reciteUserNum} 人在背</span>
          )}
        </div>
        {book.tags && book.tags.length > 0 && (
          <div className={styles.tags}>
            <AiOutlineTag style={{ marginRight: 4 }} />
            {book.tags.map((tag) => (
              <span className={styles.tag} key={tag}>{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BookList({ books, onCardClick }: { books: GetBooksResDto[]; onCardClick: (book: GetBooksResDto) => void }) {
  return (
    <div className={styles.list}>
      {books.map((book) => (
        <BookCard key={book.id} book={book} onClick={() => onCardClick(book)} />
      ))}
    </div>
  );
}

const Books = ({ onBookSelected, showHeader = true, title = "词书列表" }: BooksProps) => {
  const [books, setBooks] = useState<GetBooksResDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string>('全部');
  const [selectedBook, setSelectedBook] = useState<GetBooksResDto | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getBooks()
      .then((res) => setBooks(res.data))
      .finally(() => setLoading(false));
  }, []);

  // 获取所有tag去重
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    books.forEach(b => b.tags?.forEach(t => tagSet.add(t)));
    return ['全部', ...Array.from(tagSet)];
  }, [books]);

  // 搜索和tag过滤
  const filteredBooks = useMemo(() => {
    return books.filter(book => {
      const matchTag = activeTag === '全部' || (book.tags && book.tags.includes(activeTag));
      const matchSearch =
        !search ||
        book.name.includes(search) ||
        (book.introduce && book.introduce.includes(search));
      return matchTag && matchSearch;
    });
  }, [books, search, activeTag]);

  const handleBookClick = (book: GetBooksResDto) => {
    setSelectedBook(book);
    setModalVisible(true);
  };

  const handleAddBook = async (values: { dailyNewWords: number; dailyReviewWords: number }) => {
    if (!selectedBook) return;

    setSubmitting(true);
    try {
      await addLearningBook({
        bookId: selectedBook.id,
        dailyNewWords: values.dailyNewWords,
        dailyReviewWords: values.dailyReviewWords,
      });
      Toast.show({ content: '添加成功！', icon: 'success' });
      setModalVisible(false);
      onBookSelected?.();
    } catch (error: any) {
      Toast.show({
        content: error?.response?.data?.message || '添加失败',
        icon: 'fail'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.books}>
      {showHeader && (
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
        </div>
      )}
      <div className={styles.content}>
        <SearchBar search={search} setSearch={setSearch} />
        <TagTabs tags={allTags} activeTag={activeTag} setActiveTag={setActiveTag} />
        {loading ? (
          <div className={styles.loading}>加载中...</div>
        ) : filteredBooks.length === 0 ? (
          <div className={styles.empty}>暂无词书</div>
        ) : (
          <BookList books={filteredBooks} onCardClick={handleBookClick} />
        )}
      </div>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        closeOnAction
        title={`选择 ${selectedBook?.name}`}
        content={selectedBook && (
          <Form
            onFinish={handleAddBook}
            initialValues={{
              dailyNewWords: 20,
              dailyReviewWords: 50,
            }}
            footer={
              <Button
                block
                type='submit'
                color='primary'
                loading={submitting}
              >
                开始学习
              </Button>
            }
          >
            <div className={styles.bookInfo}>
              <div className={styles.bookName}>{selectedBook.name}</div>
              <div className={styles.bookMeta}>
                共 {selectedBook.wordNum || 0} 个单词
              </div>
            </div>

            <Form.Item
              name="dailyNewWords"
              label="每日新学单词数"
            >
              <Slider
                min={5}
                max={50}
                step={5}
                marks={{
                  5: '5',
                  25: '25',
                  50: '50',
                }}
              />
            </Form.Item>

            <Form.Item
              name="dailyReviewWords"
              label="每日复习单词数"
            >
              <Slider
                min={10}
                max={100}
                step={10}
                marks={{
                  10: '10',
                  50: '50',
                  100: '100',
                }}
              />
            </Form.Item>
          </Form>
        )}
        actions={[
          {
            key: 'cancel',
            text: '取消',
            onClick: () => setModalVisible(false),
          },
        ]}
      />
    </div>
  );
};

export default Books;
