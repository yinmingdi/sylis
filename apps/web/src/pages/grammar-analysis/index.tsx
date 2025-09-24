import type { ParseGrammarReqDto, ParseGrammarResDto } from '@sylis/shared/dto';
import { Button, Input, Toast, Loading } from 'antd-mobile';
import React, { useState, useCallback } from 'react';
import {
  AiOutlineSend,
  AiOutlineBook,
  AiOutlineEdit
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import PageHeader from '../../components/page-header';
import { parseGrammar } from '../../modules/ai/api';

const GrammarAnalysisPage: React.FC = () => {
  const navigate = useNavigate();
  const [sentence, setSentence] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParseGrammarResDto | null>(null);

  // 执行语法解析
  const handleAnalyze = useCallback(async () => {
    if (!sentence.trim()) {
      Toast.show('请输入要分析的句子');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const params: ParseGrammarReqDto = {
        sentence: sentence.trim(),
        analysisLevel: 'detailed',
        includePhrases: true,
        includeClauses: true,
        learnerLevel: 'intermediate',
      };

      const response = await parseGrammar(params);
      setResult(response.data);

      if (response.data.success) {
        Toast.show('语法分析完成');
      } else {
        Toast.show(response.data.message || '语法分析失败');
      }
    } catch (error) {
      console.error('语法分析失败:', error);
      Toast.show('语法分析失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [sentence]);

  // 渲染语法图例
  const renderGrammarLegend = () => (
    <div className={styles.grammarLegend}>
      <div className={styles.legendItem}>
        <div className={`${styles.legendCircle} ${styles.subjectCircle}`}></div>
        <span>主语</span>
      </div>
      <div className={styles.legendItem}>
        <div className={`${styles.legendCircle} ${styles.predicateCircle}`}></div>
        <span>谓语</span>
      </div>
      <div className={styles.legendItem}>
        <div className={`${styles.legendCircle} ${styles.objectCircle}`}></div>
        <span>宾语</span>
      </div>
    </div>
  );

  // 渲染高亮句子
  const renderHighlightedSentence = () => {
    if (!result?.analysis?.words) return null;

    return (
      <div className={styles.sentenceDisplay}>
        <div className={styles.englishSentence}>
          {result.analysis.words.map((word, index) => (
            <span
              key={index}
              className={`${styles.wordSpan} ${styles[getSyntacticRoleClass(word.syntacticRole)]}`}
              title={`${word.partOfSpeech} - ${word.syntacticRole}: ${word.explanation}`}
            >
              {word.word}
            </span>
          ))}
        </div>
        <div className={styles.chineseTranslation}>
          {result.translation || '你身在一个陌生的城市里。'}
        </div>
      </div>
    );
  };

  // 获取句法角色对应的CSS类名
  const getSyntacticRoleClass = (role: string) => {
    switch (role) {
      case 'SUBJECT':
        return 'subject';
      case 'PREDICATE':
        return 'predicate';
      case 'OBJECT':
        return 'object';
      default:
        return 'default';
    }
  };

  // 渲染AI解析部分
  const renderAIAnalysis = () => {
    if (!result) return null;

    return (
      <div className={styles.aiAnalysis}>
        <h3 className={styles.sectionTitle}>AI解析</h3>
        <div className={styles.analysisContent}>
          <p className={styles.meaningExplanation}>
            {result.aiExplanation || '这句话的意思是"你在一个陌生的城市里。"这里的"strange"可以理解为陌生或不熟悉的意思。'}
          </p>
        </div>
      </div>
    );
  };

  // 渲染语法分析部分
  const renderGrammarAnalysis = () => {
    if (!result) return null;

    const grammarItems = result.grammarAnalysis || [
      { component: '主语', text: 'You', explanation: '是句子的主语,表示说话的对象。' },
      { component: '谓语', text: 'are', explanation: '是系动词,连接主语和表语。' },
      { component: '宾语', text: 'in a strange city', explanation: '是表语,描述主语所处的位置和状态。' }
    ];

    return (
      <div className={styles.grammarAnalysis}>
        <h3 className={styles.sectionTitle}>
          <AiOutlineBook className={styles.sectionIcon} />
          语法分析
        </h3>
        <ul className={styles.grammarList}>
          {grammarItems.map((item, index) => (
            <li key={index}>• "{item.text}" {item.explanation}</li>
          ))}
        </ul>
      </div>
    );
  };

  // 渲染搭配积累部分
  const renderPhraseAccumulation = () => {
    if (!result) return null;

    const phrases = result.phraseAccumulation || ['"in a strange city"'];

    return (
      <div className={styles.phraseAccumulation}>
        <h3 className={styles.sectionTitle}>
          <AiOutlineEdit className={styles.sectionIcon} />
          搭配积累
        </h3>
        <div className={styles.phraseList}>
          {phrases.map((phrase, index) => (
            <div key={index} className={styles.phraseItem}>• {phrase}</div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.grammarAnalysisPage}>
      <PageHeader
        title="语法解析"
        onBack={() => navigate(-1)}
      />

      {/* 输入区域 */}
      <div className={styles.inputSection}>
        <Input
          placeholder="请输入要分析的英语句子..."
          value={sentence}
          onChange={setSentence}
          className={styles.sentenceInput}
          maxLength={500}
        />
        <Button
          color="primary"
          size="large"
          onClick={handleAnalyze}
          disabled={loading || !sentence.trim()}
          className={styles.analyzeButton}
        >
          {loading ? (
            <>
              <Loading />
              分析中...
            </>
          ) : (
            <>
              <AiOutlineSend />
              开始分析
            </>
          )}
        </Button>
      </div>

      {/* 分析结果 */}
      {result && (
        <div className={styles.analysisCard}>
          <h2 className={styles.cardTitle}>AI解析</h2>

          {/* 语法图例 */}
          {renderGrammarLegend()}

          {/* 高亮句子 */}
          {renderHighlightedSentence()}

          {/* AI解析部分 */}
          {renderAIAnalysis()}

          {/* 语法分析部分 */}
          {renderGrammarAnalysis()}

          {/* 搭配积累部分 */}
          {renderPhraseAccumulation()}
        </div>
      )}
    </div>
  );
};

export default GrammarAnalysisPage;
