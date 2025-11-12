import type { WordDetailResDto } from '@sylis/shared/dto';
import { useState } from 'react';

import { WordHeader } from '../index';
import ExampleSentences from './components/example-sentences';
import Phrases from './components/phrases';
import RealExamSentences from './components/real-exam-sentences';
import Synonyms from './components/synonyms';
import WordRelations from './components/word-relations';
import styles from './index.module.less';

// 导出类型供外部使用
export type { WordDetailResDto as WordDetailData };

interface WordDetailProps {
  data: WordDetailResDto;
  className?: string;
  requiredCorrectCount?: number;
  correctCount?: number;
}

const WordDetail = ({ data, className, requiredCorrectCount, correctCount }: WordDetailProps) => {
  const [activeTab, setActiveTab] = useState('example');

  const handlePlayAudio = () => {
    // 音频播放由 SoundButton 组件内部处理
    console.log('播放发音');
  };

  // 将 WordDetailResDto 转换为 WordHeaderData 格式
  const wordHeaderData = {
    headword: data.headword,
    usPhonetic: data.usPhonetic || undefined,
    ukPhonetic: data.ukPhonetic || undefined,
    examTags: data.examTags,
    meanings: data.meanings,
  };

  const tabs = [
    {
      key: 'example',
      title: '例句',
      hasData: data.exampleSentences && data.exampleSentences.length > 0,
      content: (
        <ExampleSentences
          sentences={data.exampleSentences}
          onPlayAudio={handlePlayAudio}
        />
      ),
    },
    {
      key: 'realExam',
      title: '真题例句',
      hasData: data.realExamSentences && data.realExamSentences.length > 0,
      content: (
        <RealExamSentences
          sentences={data.realExamSentences || []}
          headword={data.headword}
          onPlayAudio={handlePlayAudio}
        />
      ),
    },
    {
      key: 'phrases',
      title: '词组搭配',
      hasData: data.phrases && data.phrases.length > 0,
      content: <Phrases phrases={data.phrases || []} />,
    },
    {
      key: 'synonyms',
      title: '近义',
      hasData: data.synonyms && data.synonyms.length > 0,
      content: <Synonyms synonyms={data.synonyms || []} />,
    },
    {
      key: 'wordRelations',
      title: '派生',
      hasData: data.wordRelations && data.wordRelations.length > 0,
      content: <WordRelations relations={data.wordRelations || []} />,
    },
  ];

  // 过滤掉没有数据的 tab
  const visibleTabs = tabs.filter((tab) => tab.hasData);

  // 如果当前选中的 tab 被过滤掉了，选择第一个可见的 tab
  const currentTab = visibleTabs.find((tab) => tab.key === activeTab) || visibleTabs[0];
  if (currentTab && currentTab.key !== activeTab) {
    setActiveTab(currentTab.key);
  }

  const renderTabContent = () => {
    if (visibleTabs.length === 0) {
      return (
        <div className={styles.tabsContainer}>
          <div className={styles.emptyState}>暂无相关数据</div>
        </div>
      );
    }

    const currentTabData = visibleTabs.find((tab) => tab.key === activeTab);

    return (
      <div className={styles.tabsContainer}>
        {/* Tab Content */}
        <div className={styles.tabContent}>
          {currentTabData?.content}
        </div>

        {/* Tab Buttons */}
        <div className={styles.tabButtons}>
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              className={`${styles.tabButton} ${activeTab === tab.key ? styles.tabButtonActive : ''
                }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.title}
            </button>
          ))}
        </div>

      </div>
    );
  };

  return (
    <div className={`${styles.wordDetail} ${className || ''}`}>
      {/* Word Header */}
      <WordHeader
        data={wordHeaderData}
        currentVoice="us"
        onPlayAudio={handlePlayAudio}
        requiredCorrectCount={requiredCorrectCount}
        correctCount={correctCount}
      />

      {/* Tabs Content */}
      {renderTabContent()}
    </div>
  );
};

export default WordDetail;
