import { create, useModal } from '@ebay/nice-modal-react';
import { Popup } from 'antd-mobile';
import { useCallback, useMemo } from 'react';

import styles from './ArticleGenerationModal.module.less';
import ArticleGenerator from './ArticleGenerator';
import type { ArticleConfig } from './types';

export interface ArticleGenerationModalProps {
  title: string;
  description: string;
  selectedWords?: Array<{
    id: string;
    headword: string;
    meanings: Array<{
      id: string;
      meaningCn: string;
    }>;
  }>;
  onComplete?: (articleId: string) => void;
}

export const ArticleGenerationModal = create(
  ({ selectedWords = [], onComplete }: ArticleGenerationModalProps) => {
    const modal = useModal();

    // 将选中的单词转换为 ArticleConfig 格式
    const initialConfig = useMemo<Partial<ArticleConfig>>(() => {
      if (selectedWords.length > 0) {
        return {
          words: selectedWords.map((word) => ({
            id: word.id,
            word: word.headword,
            tranCn: word.meanings[0]?.meaningCn || '',
          })),
        };
      }
      return {};
    }, [selectedWords]);

    // 处理文章生成完成
    const handleArticleGenerated = useCallback(
      (article: any) => {
        // 调用完成回调，传递文章ID
        onComplete?.(article.id);
        // 延迟关闭 modal，让用户看到成功提示
        setTimeout(() => {
          modal.hide();
        }, 1500);
      },
      [onComplete, modal],
    );

    // 处理关闭
    const handleClose = useCallback(() => {
      modal.hide();
    }, [modal]);

    return (
      <Popup
        visible={modal.visible}
        onMaskClick={handleClose}
        afterClose={() => modal.remove()}
        destroyOnClose
        position="bottom"
        className={styles.popup}
        bodyStyle={{
          borderTopLeftRadius: 'var(--radius-xl)',
          borderTopRightRadius: 'var(--radius-xl)',
          maxHeight: '80vh',
        }}
      >
        <div className={styles.popupBody}>
          <ArticleGenerator
            initialConfig={initialConfig}
            showLoading={true}
            onArticleGenerated={handleArticleGenerated}
            className={styles.articleGenerator}
          />
        </div>
      </Popup>
    );
  },
);

export default ArticleGenerationModal;
