import { show } from '@ebay/nice-modal-react';
import {
  Button,
  SearchBar,
  PullToRefresh,
  InfiniteScroll,
  Toast,
  ErrorBlock,
} from 'antd-mobile';
import React, { useCallback, useEffect, useState } from 'react';
import {
  AiOutlineDelete,
  AiOutlineEdit,
  AiOutlineClose,
  AiOutlineFileText,
  AiOutlineRead,
  AiOutlineSearch,
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import type { CollectedWordItemDto } from '@/legacy-dto';

import styles from './index.module.less';
import { AppBar } from '../../../components/app-bar';
import { ArticleGenerationModal } from '../../../components/article-generator/ArticleGenerationModal';
import type { QuickToolbarItem } from '../../../components/quick-toolbar';
import QuickToolbar from '../../../components/quick-toolbar';
import type { WordItem } from '../../../components/simplified-word-list';
import SimplifiedWordList from '../../../components/simplified-word-list';
import { PageView } from '../../../components/view';
import { vocabularyNotebookApi } from '../../../modules/vocabulary/api';

interface VocabularyStats {
  totalWords: number;
  learnedWords: number;
  unlearnedWords: number;
}

const VocabularyBookPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [searchMode, setSearchMode] = useState(false);

  const [words, setWords] = useState<WordItem[]>([]);
  const [allWords, setAllWords] = useState<WordItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [defaultNotebookId, setDefaultNotebookId] = useState<string>('');
  const [, setStats] = useState<VocabularyStats>({
    totalWords: 0,
    learnedWords: 0,
    unlearnedWords: 0,
  });

  // 获取默认生词本 ID
  const fetchDefaultNotebook = useCallback(async () => {
    try {
      const res = await vocabularyNotebookApi.getNotebooks();
      const defaultNotebook = res.data.notebooks.find((nb) => nb.isDefault);
      if (defaultNotebook) {
        setDefaultNotebookId(defaultNotebook.id);
        return defaultNotebook.id;
      }
    } catch (error) {
      console.error('Failed to fetch notebooks:', error);
      Toast.show({
        content: '获取生词本失败',
        icon: 'fail',
      });
    }
    return '';
  }, []);

  // 将 API 数据转换为 WordItem 格式
  const convertToWordItem = (item: CollectedWordItemDto): WordItem => ({
    id: item.id,
    headword: item.headword,
    usPhonetic: item.phonetic,
    star: 3, // 默认值，后端可能需要返回
    meanings: item.meanings.map((m, idx) => ({
      id: `${item.id}-${idx}`,
      ...m,
    })),
    isCollected: true,
    learningStatus: item.proficiencyLevel as any,
    difficulty: item.difficultyLevel as any,
    proficiencyScore: item.proficiencyScore,
    proficiencyLevel: item.proficiencyLevel,
    difficultyScore: item.difficultyScore,
    accuracyRate: item.accuracyRate,
    reviewCount: item.reviewCount,
  });

  // 加载生词本数据
  const loadVocabularyData = useCallback(
    async (isRefresh = false, page = 1) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else if (page === 1) {
          setLoading(true);
        }

        let notebookId = defaultNotebookId;
        if (!notebookId) {
          notebookId = await fetchDefaultNotebook();
          if (!notebookId) {
            setWords([]);
            setLoading(false);
            setRefreshing(false);
            return;
          }
        }

        // 构建查询参数
        const params: any = {
          page,
          limit: 20,
        };

        const res = await vocabularyNotebookApi.getNotebookWords(
          notebookId,
          params,
        );
        const convertedWords = res.data.words.map(convertToWordItem);

        // 维护本地全集并基于本地数据进行搜索过滤
        setAllWords((prev) => {
          const nextAll =
            page === 1 ? convertedWords : [...prev, ...convertedWords];
          const filtered = applySearch(nextAll, searchValue);
          setWords(filtered);
          setHasMore(nextAll.length < res.data.total);
          return nextAll;
        });

        setCurrentPage(page);

        // 获取统计信息
        const statsRes =
          await vocabularyNotebookApi.getNotebookStats(notebookId);
        setStats({
          totalWords: statsRes.data.total,
          learnedWords: statsRes.data.learnedCount,
          unlearnedWords: statsRes.data.unlearnedCount,
        });
      } catch (error) {
        console.error('Failed to load vocabulary:', error);
        Toast.show({
          content: '加载失败，请重试',
          icon: 'fail',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [defaultNotebookId, fetchDefaultNotebook, searchValue],
  );

  // 应用搜索
  const applySearch = (wordsList: WordItem[], search: string): WordItem[] => {
    let filtered = [...wordsList];

    // 搜索过滤
    if (search) {
      filtered = filtered.filter(
        (word) =>
          word.headword.toLowerCase().includes(search.toLowerCase()) ||
          word.meanings.some((m) => m.meaningCn.includes(search)),
      );
    }

    return filtered;
  };

  // 初始化
  useEffect(() => {
    loadVocabularyData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 搜索（仅本地过滤，不走接口）
  useEffect(() => {
    const timer = setTimeout(() => {
      setWords(applySearch(allWords, searchValue));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue, allWords]);

  const handleRefresh = async () => {
    await loadVocabularyData(true, 1);
  };

  const loadMore = async () => {
    if (!hasMore) return;
    await loadVocabularyData(false, currentPage + 1);
  };

  const handleToggleCollect = async (wordId: string, collected: boolean) => {
    try {
      if (!collected && defaultNotebookId) {
        // 从生词本移除
        await vocabularyNotebookApi.removeWordFromNotebook(
          defaultNotebookId,
          wordId,
        );
        setWords((prev) => prev.filter((word) => word.id !== wordId));
        setAllWords((prev) => prev.filter((word) => word.id !== wordId));
        setStats((prev) => ({ ...prev, totalWords: prev.totalWords - 1 }));
        Toast.show({
          content: '已从生词本移除',
          icon: 'success',
        });
      }
    } catch (error) {
      console.error(error);
      Toast.show({
        content: '操作失败，请重试',
        icon: 'fail',
      });
    }
  };

  const handleWordClick = (word: WordItem) => {
    if (editMode) {
      setSelectedWords((prev) =>
        prev.includes(word.id)
          ? prev.filter((id) => id !== word.id)
          : [...prev, word.id],
      );
    } else {
      // 跳转到单词详情页（使用单词文本）
      navigate(`/word-detail/${word.headword}`);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedWords.length === 0 || !defaultNotebookId) return;

    try {
      // 批量删除
      await Promise.all(
        selectedWords.map((wordId) =>
          vocabularyNotebookApi.removeWordFromNotebook(
            defaultNotebookId,
            wordId,
          ),
        ),
      );

      setWords((prev) =>
        prev.filter((word) => !selectedWords.includes(word.id)),
      );
      setAllWords((prev) =>
        prev.filter((word) => !selectedWords.includes(word.id)),
      );
      setStats((prev) => ({
        ...prev,
        totalWords: prev.totalWords - selectedWords.length,
      }));
      setSelectedWords([]);
      setEditMode(false);

      Toast.show({
        content: `已删除 ${selectedWords.length} 个单词`,
        icon: 'success',
      });
    } catch (error) {
      console.error(error);
      Toast.show({
        content: '删除失败，请重试',
        icon: 'fail',
      });
    }
  };

  const handleGenerateArticle = async () => {
    if (selectedWords.length === 0) {
      Toast.show({
        content: '请先选择要生成文章的单词',
        icon: 'fail',
      });
      return;
    }

    show(ArticleGenerationModal, {
      title: '生成文章',
      description: '基于选中的单词生成练习文章',
      selectedWords: words.filter((word) => selectedWords.includes(word.id)),
      onComplete: handleArticleComplete,
    });
  };

  const handleGenerateCloze = async () => {
    if (selectedWords.length === 0) {
      Toast.show({
        content: '请先选择要生成阅读填空的单词',
        icon: 'fail',
      });
      return;
    }

    show(ArticleGenerationModal, {
      title: '生成阅读填空',
      description: '基于选中的单词生成阅读填空练习',
      selectedWords: words.filter((word) => selectedWords.includes(word.id)),
      onComplete: handleArticleComplete,
    });
  };

  // 处理文章生成完成
  const handleArticleComplete = useCallback(
    (articleId: string) => {
      setEditMode(false);
      setSelectedWords([]);
      navigate(`/articles/${articleId}`);
    },
    [navigate],
  );

  const renderToolbar = () => {
    return null;
  };

  // 快捷工具栏配置
  const quickToolbarItems: QuickToolbarItem[] = [
    {
      key: 'delete',
      icon: <AiOutlineDelete />,
      label: '删除',
      onClick: handleBatchDelete,
      disabled: selectedWords.length === 0,
      color: '#ff4d4f',
    },
    {
      key: 'article',
      icon: <AiOutlineFileText />,
      label: '生成文章',
      onClick: handleGenerateArticle,
      disabled: selectedWords.length === 0,
      color: '#1890ff',
    },
    {
      key: 'cloze',
      icon: <AiOutlineRead />,
      label: '阅读填空',
      onClick: handleGenerateCloze,
      disabled: selectedWords.length === 0,
      color: '#52c41a',
    },
  ];

  const renderPageHeaderActions = () => {
    if (searchMode) {
      return (
        <Button
          size="small"
          fill="none"
          onClick={() => {
            setSearchMode(false);
            setSearchValue('');
          }}
        >
          <AiOutlineClose />
        </Button>
      );
    }

    if (!editMode) {
      return (
        <>
          <Button
            size="small"
            fill="none"
            onClick={() => setSearchMode(true)}
            className={styles.actionButton}
          >
            <AiOutlineSearch />
          </Button>
          <Button
            size="small"
            fill="none"
            onClick={() => setEditMode(true)}
            disabled={words.length === 0}
            className={styles.actionButton}
          >
            <AiOutlineEdit />
          </Button>
        </>
      );
    }

    return (
      <Button
        size="small"
        fill="none"
        onClick={() => {
          setEditMode(false);
          setSelectedWords([]);
        }}
      >
        <AiOutlineClose />
      </Button>
    );
  };

  // 渲染header中间内容
  const renderHeaderCenter = () => {
    if (searchMode) {
      return (
        <SearchBar
          placeholder="搜索单词或释义..."
          value={searchValue}
          onChange={setSearchValue}
          className={styles.headerSearchBar}
          autoFocus
        />
      );
    }
    return null;
  };

  if (loading && !refreshing) {
    return (
      <PageView
        appBar={<AppBar title="生词本" onBack={() => navigate(-1)} />}
        className={styles.vocabularyBookPage}
      >
        <SimplifiedWordList words={[]} loading={true} />
      </PageView>
    );
  }

  return (
    <PageView
      appBar={
        <AppBar
          title={searchMode ? '' : '生词本'}
          onBack={() => navigate(-1)}
          actions={renderPageHeaderActions()}
        >
          {renderHeaderCenter()}
        </AppBar>
      }
      className={styles.vocabularyBookPage}
    >
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
              <SimplifiedWordList
                words={words}
                onWordClick={handleWordClick}
                onToggleCollect={handleToggleCollect}
                showCollectButton={!editMode}
                showDifficulty={true}
                showProficiency={true}
                editMode={editMode}
                selectedWords={selectedWords}
              />
            </div>

            <InfiniteScroll loadMore={loadMore} hasMore={hasMore} />
          </>
        )}
      </PullToRefresh>

      {/* 快捷工具栏 */}
      <QuickToolbar items={quickToolbarItems} visible={editMode} />
    </PageView>
  );
};

export default VocabularyBookPage;
