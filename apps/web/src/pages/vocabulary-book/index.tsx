import {
  Button,
  SearchBar,
  Selector,
  PullToRefresh,
  InfiniteScroll,
  Toast,
  ErrorBlock
} from 'antd-mobile';
import React, { useCallback, useEffect, useState } from 'react';
import {
  AiOutlineFilter,
  AiOutlineDelete,
  AiOutlineEdit,
  AiOutlineUpload,
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import PageHeader from '../../components/page-header';
import WordList from '../../components/word-list';
import type { WordItem } from '../../components/word-list';

interface VocabularyStats {
  totalWords: number;
  reviewWords: number;
  masteredWords: number;
  studyDays: number;
}

type SortType = 'addTime' | 'alphabetical' | 'difficulty' | 'star';
type FilterType = 'all' | 'new' | 'learning' | 'mastered' | 'review';

const VocabularyBookPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  const [sortType, setSortType] = useState<SortType>('addTime');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);

  const [words, setWords] = useState<WordItem[]>([]);
  const [, setStats] = useState<VocabularyStats>({
    totalWords: 0,
    reviewWords: 0,
    masteredWords: 0,
    studyDays: 0
  });

  const loadVocabularyData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 800));

      // 模拟数据
      const mockWords: WordItem[] = [
        {
          id: '1',
          headword: 'vocabulary',
          ukPhonetic: 'vəˈkæbjʊləri',
          usPhonetic: 'voʊˈkæbjəleri',
          ukAudio: '/audio/vocabulary_uk.mp3',
          usAudio: '/audio/vocabulary_us.mp3',
          star: 4,
          meanings: [
            {
              id: '1-1',
              partOfSpeech: 'n.',
              meaningCn: '词汇，词汇量'
            },
            {
              id: '1-2',
              partOfSpeech: 'n.',
              meaningCn: '词典，词表'
            }
          ],
          isCollected: true,
          learningStatus: 'learning',
          difficulty: 'medium'
        },
        {
          id: '2',
          headword: 'comprehension',
          ukPhonetic: 'ˌkɒmprɪˈhenʃn',
          usPhonetic: 'ˌkɑːmprɪˈhenʃn',
          star: 5,
          meanings: [
            {
              id: '2-1',
              partOfSpeech: 'n.',
              meaningCn: '理解，理解力'
            }
          ],
          isCollected: true,
          learningStatus: 'mastered',
          difficulty: 'hard'
        },
        {
          id: '3',
          headword: 'fluent',
          ukPhonetic: 'ˈfluːənt',
          usPhonetic: 'ˈfluːənt',
          star: 3,
          meanings: [
            {
              id: '3-1',
              partOfSpeech: 'adj.',
              meaningCn: '流利的，流畅的'
            }
          ],
          isCollected: true,
          learningStatus: 'review',
          difficulty: 'easy'
        },
        {
          id: '4',
          headword: 'pronunciation',
          ukPhonetic: 'prəˌnʌnsiˈeɪʃn',
          usPhonetic: 'prəˌnʌnsiˈeɪʃn',
          star: 2,
          meanings: [
            {
              id: '4-1',
              partOfSpeech: 'n.',
              meaningCn: '发音，读法'
            }
          ],
          isCollected: true,
          learningStatus: 'new',
          difficulty: 'medium'
        }
      ];

      const filteredWords = applyFiltersAndSort(mockWords, filterType, sortType, searchValue);

      setWords(filteredWords);
      setStats({
        totalWords: mockWords.length,
        reviewWords: mockWords.filter(w => w.learningStatus === 'review').length,
        masteredWords: mockWords.filter(w => w.learningStatus === 'mastered').length,
        studyDays: 15
      });

    } catch (error) {
      console.error('Failed to load vocabulary:', error);
      Toast.show({
        content: '加载失败，请重试',
        icon: 'fail'
      });

    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterType, sortType, searchValue]);

  const handleSearch = useCallback(() => {
    loadVocabularyData();
  }, [loadVocabularyData]);

  useEffect(() => {
    loadVocabularyData();
  }, [sortType, filterType, loadVocabularyData]);

  useEffect(() => {
    if (searchValue) {
      handleSearch();
    } else {
      loadVocabularyData();
    }
  }, [searchValue, loadVocabularyData, handleSearch]);



  const applyFiltersAndSort = (
    wordsList: WordItem[],
    filter: FilterType,
    sort: SortType,
    search: string
  ): WordItem[] => {
    let filtered = [...wordsList];

    // 搜索过滤
    if (search) {
      filtered = filtered.filter(word =>
        word.headword.toLowerCase().includes(search.toLowerCase()) ||
        word.meanings.some(m => m.meaningCn.includes(search))
      );
    }

    // 状态过滤
    if (filter !== 'all') {
      filtered = filtered.filter(word => word.learningStatus === filter);
    }

    // 排序
    filtered.sort((a, b) => {
      switch (sort) {
        case 'alphabetical':
          return a.headword.localeCompare(b.headword);
        case 'star':
          return b.star - a.star;
        case 'difficulty': {
          const difficultyOrder = { easy: 1, medium: 2, hard: 3 };
          return (difficultyOrder[a.difficulty || 'medium'] || 2) -
            (difficultyOrder[b.difficulty || 'medium'] || 2);
        }
        case 'addTime':
        default:
          return 0; // 保持原有顺序
      }
    });

    return filtered;
  };



  const handleRefresh = async () => {
    await loadVocabularyData(true);
  };

  const loadMore = async () => {
    // 模拟加载更多
    await new Promise(resolve => setTimeout(resolve, 1000));
    setHasMore(false);
  };

  const handleToggleCollect = async (wordId: string, collected: boolean) => {
    try {
      // 模拟API调用
      setWords(prev => prev.map(word =>
        word.id === wordId ? { ...word, isCollected: collected } : word
      ));

      if (!collected) {
        // 如果取消收藏，从生词本移除
        setWords(prev => prev.filter(word => word.id !== wordId));
        setStats(prev => ({ ...prev, totalWords: prev.totalWords - 1 }));
      }

      Toast.show({
        content: collected ? '已添加到生词本' : '已从生词本移除',
        icon: 'success'
      });
    } catch (error) {
      console.error(error);
      Toast.show({
        content: '操作失败，请重试',
        icon: 'fail'
      });
    }
  };

  const handleWordClick = (word: WordItem) => {
    if (editMode) {
      setSelectedWords(prev =>
        prev.includes(word.id)
          ? prev.filter(id => id !== word.id)
          : [...prev, word.id]
      );
    } else {
      // 跳转到单词详情页
      navigate(`/word-detail/${word.id}`);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedWords.length === 0) return;

    try {
      // 模拟批量删除
      setWords(prev => prev.filter(word => !selectedWords.includes(word.id)));
      setStats(prev => ({ ...prev, totalWords: prev.totalWords - selectedWords.length }));
      setSelectedWords([]);
      setEditMode(false);

      Toast.show({
        content: `已删除 ${selectedWords.length} 个单词`,
        icon: 'success'
      });
    } catch (error) {
      console.error(error);
      Toast.show({
        content: '删除失败，请重试',
        icon: 'fail'
      });
    }
  };

  const handleExport = async () => {
    try {
      // 模拟导出
      Toast.show({
        content: '导出成功',
        icon: 'success'
      });
    } catch (error) {
      console.error(error);
      Toast.show({
        content: '导出失败，请重试',
        icon: 'fail'
      });
    }
  };

  const sortOptions = [
    { label: '添加时间', value: 'addTime' },
    { label: '字母顺序', value: 'alphabetical' },
    { label: '难度等级', value: 'difficulty' },
    { label: '重要程度', value: 'star' }
  ];

  const filterOptions = [
    { label: '全部', value: 'all' },
    { label: '新学', value: 'new' },
    { label: '学习中', value: 'learning' },
    { label: '已掌握', value: 'mastered' },
    { label: '待复习', value: 'review' }
  ];



  const renderToolbar = () => (
    <div className={styles.toolbar}>
      <div className={styles.toolbarMain}>
        <SearchBar
          placeholder="搜索单词或释义..."
          value={searchValue}
          onChange={setSearchValue}
          className={styles.searchBar}
        />
        <Button
          size="small"
          fill="none"
          onClick={() => setShowFilters(!showFilters)}
          className={styles.filterBtn}
        >
          <AiOutlineFilter />
        </Button>
      </div>

      {showFilters && (
        <div className={styles.filtersPanel}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>排序：</span>
            <Selector
              options={sortOptions}
              value={[sortType]}
              onChange={(value) => setSortType(value[0] as SortType)}
              style={{ '--border': 'none' }}
            />
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>筛选：</span>
            <Selector
              options={filterOptions}
              value={[filterType]}
              onChange={(value) => setFilterType(value[0] as FilterType)}
              style={{ '--border': 'none' }}
            />
          </div>
        </div>
      )}
    </div>
  );

  const renderActionBar = () => {
    if (!editMode) {
      return (
        <div className={styles.actionBar}>
          <Button
            size="small"
            fill="none"
            onClick={() => setEditMode(true)}
            disabled={words.length === 0}
          >
            <AiOutlineEdit />
            编辑
          </Button>
          <Button
            size="small"
            fill="none"
            onClick={handleExport}
            disabled={words.length === 0}
          >
            <AiOutlineUpload />
            导出
          </Button>
        </div>
      );
    }

    return (
      <div className={styles.actionBar}>
        <Button
          size="small"
          fill="none"
          onClick={() => {
            setEditMode(false);
            setSelectedWords([]);
          }}
        >
          取消
        </Button>
        <div className={styles.selectionInfo}>
          已选择 {selectedWords.length} 个
        </div>
        <Button
          size="small"
          color="danger"
          onClick={handleBatchDelete}
          disabled={selectedWords.length === 0}
        >
          <AiOutlineDelete />
          删除
        </Button>
      </div>
    );
  };

  if (loading && !refreshing) {
    return (
      <div className={styles.vocabularyBookPage}>
        <PageHeader title="生词本" onBack={() => navigate(-1)} />
        <div className={styles.content}>
          <WordList words={[]} loading={true} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.vocabularyBookPage}>
      <PageHeader
        title="生词本"
        onBack={() => navigate(-1)}
        actions={renderActionBar()}
      />

      <div className={styles.content}>
        <PullToRefresh onRefresh={handleRefresh}>
          {renderToolbar()}

          {words.length === 0 ? (
            <ErrorBlock
              description="生词本为空"
              image="/images/empty-vocabulary.png"
            >
              <Button
                color="primary"
                onClick={() => navigate('/vocabulary-learning')}
              >
                去学习单词
              </Button>
            </ErrorBlock>
          ) : (
            <>
              <div className={styles.wordsSection}>
                <div className={styles.wordsHeader}>
                  <h3 className={styles.sectionTitle}>
                    我的生词 ({words.length})
                  </h3>
                </div>

                <WordList
                  words={words}
                  onWordClick={handleWordClick}
                  onToggleCollect={handleToggleCollect}
                  showCollectButton={!editMode}
                  showStatus={true}
                  showDifficulty={true}
                  layout="card"
                />
              </div>

              <InfiniteScroll
                loadMore={loadMore}
                hasMore={hasMore}
              />
            </>
          )}
        </PullToRefresh>
      </div>
    </div>
  );
};

export default VocabularyBookPage;
