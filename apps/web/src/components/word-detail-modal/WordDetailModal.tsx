import { create, useModal, show } from '@ebay/nice-modal-react';
import type { WordDetailResDto } from '@sylis/shared/dto';
import { Popup, Toast } from 'antd-mobile';
import { useEffect, useRef, useState } from 'react';
import {
  AiFillOpenAI,
  AiOutlineStar,
  AiOutlineFileText,
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import { useClickOutside } from '../../hooks';
import { translateText } from '../../modules/vocabulary/api';
import { GrammarAnalysisModal } from '../grammar-analysis';
import WordHeader from '../word-header';
import WordDetailSkeleton from './WordDetailSkeleton';

export interface WordDetailModalProps {
  text: string; // 可以是单词或句子
  onClose?: () => void; // 关闭回调
}

export const WordDetailModal = create(
  ({ text, onClose }: WordDetailModalProps) => {
    const modal = useModal();
    const navigate = useNavigate();
    const modalRef = useRef<HTMLDivElement>(null);
    const [wordInfo, setWordInfo] = useState<WordDetailResDto | null>(null);
    const [loading, setLoading] = useState(false);

    // 监听点击外部
    useClickOutside(modalRef, {
      onClickOutside: () => {
        modal.hide();
      },
      disabled: !modal.visible,
    });

    // 获取翻译信息
    useEffect(() => {
      const fetchTranslation = async () => {
        if (!text) return;

        setLoading(true);
        try {
          // 使用翻译接口（内部会先尝试getWordDetail，如果没有则使用AI翻译）
          const result = await translateText(text);
          setWordInfo(result);
          // 判断是否来自AI（ID为空表示来自AI）
        } catch (error) {
          console.error('获取翻译失败:', error);
          Toast.show('获取翻译失败');
        } finally {
          setLoading(false);
        }
      };

      fetchTranslation();
    }, [text]);

    // 打开语法分析弹窗
    const handleAiAnalysis = () => {
      show(GrammarAnalysisModal, {
        text: text,
        autoAnalyze: true,
        onAnalysisComplete: (result) => {
          console.log('语法分析完成:', result);
        },
      });
    };

    // 添加到生词本
    const handleAddToVocabulary = () => {
      // TODO: 实现添加到生词本功能
      Toast.show('已添加到生词本');
    };

    // 跳转到单词详情页
    const handleGoToDetail = () => {
      modal.hide();
      navigate(`/word-detail/${text}`);
    };

    // 渲染底部操作栏
    const renderActionBar = () => {
      return (
        <div className={styles.actionBar}>
          <button className={styles.actionItem} onClick={handleAddToVocabulary}>
            <AiOutlineStar className={styles.actionIcon} />
            <span>收藏</span>
          </button>
          <button className={styles.actionItem} onClick={handleAiAnalysis}>
            <AiFillOpenAI className={styles.actionIcon} />
            <span>AI解析</span>
          </button>
          {wordInfo && wordInfo.id && (
            <button className={styles.actionItem} onClick={handleGoToDetail}>
              <AiOutlineFileText className={styles.actionIcon} />
              <span>详情</span>
            </button>
          )}
        </div>
      );
    };

    return (
      <Popup
        visible={modal.visible}
        bodyClassName={styles.wordDetailModalBody}
        onMaskClick={() => modal.hide()}
        afterClose={() => {
          modal.remove();
          onClose?.();
        }}
        destroyOnClose
        mask={false}
        position="top"
        bodyStyle={{
          borderBottomLeftRadius: 'var(--radius-xl)',
          borderBottomRightRadius: 'var(--radius-xl)',
          maxHeight: '80vh',
        }}
      >
        <div className={styles.wordDetailModal} ref={modalRef}>
          {loading ? (
            <WordDetailSkeleton />
          ) : (
            <WordHeader
              data={{
                headword: wordInfo?.headword || text,
                usPhonetic: wordInfo?.usPhonetic || undefined,
                ukPhonetic: wordInfo?.ukPhonetic || undefined,
                examTags: wordInfo?.examTags,
                meanings: (wordInfo?.meanings || []).slice(0, 2), // 只展示最多2个meanings
              }}
              style={{ padding: 0 }}
            />
          )}
          {renderActionBar()}
        </div>
      </Popup>
    );
  },
);
