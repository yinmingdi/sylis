import { CollectionSource } from '@sylis/shared/dto';
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import styles from './index.module.less';

import {
  WordDetail,
  UnderlineActions,
  type WordDetailData,
} from '../../../components';
import { AppBar } from '../../../components/app-bar';
import { PageView } from '../../../components/view';
import { useWordCollection } from '../../../hooks/useWordCollection';
import { getWordDetail } from '../../../modules/vocabulary/api';

const WordDetailPage = () => {
  const { word } = useParams<{ word: string }>();
  const navigate = useNavigate();
  const [wordData, setWordData] = useState<WordDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  // 收藏功能
  const wordCollection = useWordCollection({
    onSuccess: (wordId, isCollected) => {
      // 可以在这里刷新数据或更新UI
      console.log('收藏状态更新:', wordId, isCollected);
    },
  });

  useEffect(() => {
    if (!word) {
      navigate('/');
      return;
    }

    const fetchWordDetail = async () => {
      try {
        setLoading(true);
        const data = await getWordDetail(word);
        setWordData(data);
      } catch (error) {
        console.error('获取单词详情失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWordDetail();
  }, [word, navigate]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleAddToWordList = async () => {
    if (!wordData?.id) return;

    const isCollected = wordCollection.isCollected(wordData.id);
    await wordCollection.toggleCollection(
      wordData.id,
      isCollected,
      CollectionSource.MANUAL,
    );
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
      }}>
        加载中...
      </div>
    );
  }

  if (!wordData) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
      }}>
        单词不存在
      </div>
    );
  }

  const actions = [
    {
      label: wordCollection.isCollected(wordData?.id || '') ? '已收藏' : '加入生词本',
      onClick: handleAddToWordList,
      underlineColor: wordCollection.isCollected(wordData?.id || '')
        ? 'var(--color-success)'
        : 'var(--color-primary-500)',
    },
  ];

  return (
    <PageView
      bodyClassName={styles.container}
      appBar={
        <AppBar title="单词详情" onBack={handleBack} />
      }
    >
      <WordDetail data={wordData} />
      <UnderlineActions actions={actions} />
    </PageView>
  );
};

export default WordDetailPage;
