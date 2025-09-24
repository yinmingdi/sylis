import type { GetBooksResDto } from '@sylis/shared/dto';
import { Input, Grid } from 'antd-mobile';
import React, { useEffect, useState, useMemo } from 'react';
import {
    AiOutlineBook,
    AiOutlineUser,
    AiOutlineTag,
    AiOutlineSearch,
    AiOutlineArrowRight,
    AiOutlineBarChart,
    AiOutlineClockCircle
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import PageHeader from '../../components/page-header';
import { getBooks } from '../../modules/books/api';

interface BookStats {
    totalBooks: number;
    totalWords: number;
    popularBooks: number;
}

// 搜索栏组件
const SearchBar: React.FC<{ search: string; setSearch: (value: string) => void }> = ({
    search,
    setSearch
}) => (
    <div className={styles.searchBar}>
        <AiOutlineSearch className={styles.searchIcon} />
        <Input
            className={styles.searchInput}
            type="text"
            placeholder="搜索词书名称或简介"
            value={search}
            onChange={setSearch}
        />
    </div>
);

// 标签筛选组件
const TagFilter: React.FC<{
    tags: string[];
    activeTag: string;
    setActiveTag: (tag: string) => void
}> = ({ tags, activeTag, setActiveTag }) => (
    <div className={styles.tagFilter}>
        {tags.map(tag => (
            <button
                key={tag}
                className={tag === activeTag ? styles.activeTag : styles.tagButton}
                onClick={() => setActiveTag(tag)}
            >
                <AiOutlineTag className={styles.tagIcon} />
                {tag}
            </button>
        ))}
    </div>
);

// 统计卡片组件
const StatsSection: React.FC<{ stats: BookStats }> = ({ stats }) => (
    <div className={styles.statsSection}>
        <h3 className={styles.sectionTitle}>词书统计</h3>
        <Grid columns={3} gap={12}>
            <Grid.Item>
                <div className={styles.statCard}>
                    <AiOutlineBook className={styles.statIcon} style={{ color: '#2ec4b6' }} />
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{stats.totalBooks}</div>
                        <div className={styles.statLabel}>总词书</div>
                    </div>
                </div>
            </Grid.Item>
            <Grid.Item>
                <div className={styles.statCard}>
                    <AiOutlineBarChart className={styles.statIcon} style={{ color: '#ff9f1c' }} />
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{stats.totalWords}</div>
                        <div className={styles.statLabel}>总词汇</div>
                    </div>
                </div>
            </Grid.Item>
            <Grid.Item>
                <div className={styles.statCard}>
                    <AiOutlineClockCircle className={styles.statIcon} style={{ color: '#f71735' }} />
                    <div className={styles.statContent}>
                        <div className={styles.statValue}>{stats.popularBooks}</div>
                        <div className={styles.statLabel}>热门</div>
                    </div>
                </div>
            </Grid.Item>
        </Grid>
    </div>
);

// 书籍卡片组件
const BookCard: React.FC<{
    book: GetBooksResDto;
    onClick: () => void
}> = ({ book, onClick }) => (
    <div className={styles.bookCard} onClick={onClick}>
        <div className={styles.bookContent}>
            <div className={styles.bookCover}>
                {book.coverUrl ? (
                    <img src={book.coverUrl} alt={book.name} />
                ) : (
                    <AiOutlineBook />
                )}
            </div>
            <div className={styles.bookInfo}>
                <div className={styles.bookTitle}>{book.name}</div>
                {book.introduce && (
                    <div className={styles.bookIntro}>{book.introduce}</div>
                )}
                <div className={styles.bookMeta}>
                    <span className={styles.wordCount}>
                        <AiOutlineBook className={styles.metaIcon} />
                        {book.wordNum || 0} 词
                    </span>
                    {book.reciteUserNum !== null && (
                        <span className={styles.userCount}>
                            <AiOutlineUser className={styles.metaIcon} />
                            {book.reciteUserNum} 人在背
                        </span>
                    )}
                </div>
                {book.tags && book.tags.length > 0 && (
                    <div className={styles.bookTags}>
                        {book.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className={styles.bookTag}>
                                {tag}
                            </span>
                        ))}
                        {book.tags.length > 3 && (
                            <span className={styles.moreTag}>+{book.tags.length - 3}</span>
                        )}
                    </div>
                )}
            </div>
            <AiOutlineArrowRight className={styles.arrow} />
        </div>
    </div>
);

// 书籍列表组件
const BooksList: React.FC<{
    books: GetBooksResDto[];
    onBookClick: (book: GetBooksResDto) => void
}> = ({ books, onBookClick }) => (
    <div className={styles.booksGrid}>
        {books.map((book) => (
            <BookCard
                key={book.id}
                book={book}
                onClick={() => onBookClick(book)}
            />
        ))}
    </div>
);

// 空状态组件
const EmptyState: React.FC<{ message: string }> = ({ message }) => (
    <div className={styles.emptyState}>
        <AiOutlineBook className={styles.emptyIcon} />
        <p>{message}</p>
    </div>
);

// 加载状态组件
const LoadingState: React.FC = () => (
    <div className={styles.loading}>
        <div className={styles.loadingSpinner} />
        <p>正在加载词书...</p>
    </div>
);

const BooksPage: React.FC = () => {
    const navigate = useNavigate();
    const [books, setBooks] = useState<GetBooksResDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeTag, setActiveTag] = useState<string>('全部');

    useEffect(() => {
        loadBooks();
    }, []);

    const loadBooks = async () => {
        try {
            const response = await getBooks();
            const bookData = response.data || [];
            setBooks(bookData);
        } catch (error) {
            console.error('Failed to load books:', error);
        } finally {
            setLoading(false);
        }
    };

    // 统计数据
    const stats = useMemo((): BookStats => {
        const totalWords = books.reduce((sum, book) => sum + (book.wordNum || 0), 0);
        const popularBooks = books.filter(book => (book.reciteUserNum || 0) > 100).length;

        return {
            totalBooks: books.length,
            totalWords,
            popularBooks
        };
    }, [books]);

    // 获取所有标签
    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        books.forEach(book => {
            book.tags?.forEach(tag => tagSet.add(tag));
        });
        return ['全部', ...Array.from(tagSet)];
    }, [books]);

    // 过滤书籍
    const filteredBooks = useMemo(() => {
        return books.filter(book => {
            const matchesTag = activeTag === '全部' || (book.tags && book.tags.includes(activeTag));
            const matchesSearch = !search ||
                book.name.toLowerCase().includes(search.toLowerCase()) ||
                (book.introduce && book.introduce.toLowerCase().includes(search.toLowerCase()));

            return matchesTag && matchesSearch;
        });
    }, [books, search, activeTag]);

    const handleBookClick = (book: GetBooksResDto) => {
        navigate(`/book-detail/${book.id}`);
    };

    const renderContent = () => {
        if (loading) {
            return <LoadingState />;
        }

        if (books.length === 0) {
            return <EmptyState message="暂无词书数据" />;
        }

        if (filteredBooks.length === 0) {
            return <EmptyState message="未找到符合条件的词书" />;
        }

        return <BooksList books={filteredBooks} onBookClick={handleBookClick} />;
    };



    return (
        <div className={styles.booksPage}>
            <PageHeader
                title="词书选择"
                showBack={true}
                onBack={() => navigate(-1)}
            />

            <div className={styles.content}>
                <StatsSection stats={stats} />

                <div className={styles.filtersSection}>
                    <SearchBar search={search} setSearch={setSearch} />
                    <TagFilter
                        tags={allTags}
                        activeTag={activeTag}
                        setActiveTag={setActiveTag}
                    />
                </div>

                <div className={styles.booksSection}>
                    <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>
                            词书列表
                            {!loading && filteredBooks.length > 0 && (
                                <span className={styles.resultCount}>
                                    （{filteredBooks.length}本）
                                </span>
                            )}
                        </h3>
                    </div>
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default BooksPage;
