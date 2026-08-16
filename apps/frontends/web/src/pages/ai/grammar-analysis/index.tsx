import { Button, Input, Toast } from 'antd-mobile';
import React, { useState } from 'react';
import { AiOutlineSend } from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import { GrammarAnalysis } from '../../../components';
import { AppBar } from '../../../components/app-bar';
import { PageView } from '../../../components/view';

const GrammarAnalysisPage: React.FC = () => {
  const navigate = useNavigate();
  const [sentence, setSentence] = useState('');
  const [analyzedSentence, setAnalyzedSentence] = useState('');

  // 执行语法解析
  const handleAnalyze = () => {
    if (!sentence.trim()) {
      Toast.show('请输入要分析的句子');
      return;
    }

    setAnalyzedSentence(sentence.trim());
  };

  return (
    <PageView
      className={styles.grammarAnalysisPage}
      appBar={<AppBar title="语法解析" onBack={() => navigate(-1)} />}
    >
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
          disabled={!sentence.trim()}
          className={styles.analyzeButton}
        >
          <AiOutlineSend />
          开始分析
        </Button>
      </div>

      {/* 分析结果 */}
      {analyzedSentence && (
        <GrammarAnalysis
          text={analyzedSentence}
          autoAnalyze={true}
          onAnalysisComplete={(result) => {
            console.log('分析完成:', result);
          }}
        />
      )}
    </PageView>
  );
};

export default GrammarAnalysisPage;
