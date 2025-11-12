import { create, useModal } from '@ebay/nice-modal-react';
import type { ParseGrammarResDto } from '@sylis/shared/dto';
import { Popup } from 'antd-mobile';
import { useRef } from 'react';

import GrammarAnalysis from './GrammarAnalysis';
import styles from './index.module.less';
import { useClickOutside } from '../../hooks';

export interface GrammarAnalysisModalProps {
  text: string;
  autoAnalyze?: boolean;
  onAnalysisComplete?: (result: ParseGrammarResDto) => void;
}

export const GrammarAnalysisModal = create(
  ({ text, autoAnalyze = true, onAnalysisComplete }: GrammarAnalysisModalProps) => {
    const modal = useModal();
    const modalRef = useRef<HTMLDivElement>(null);

    // 监听点击外部
    useClickOutside(modalRef, {
      onClickOutside: () => {
        modal.hide();
      },
      disabled: !modal.visible,
    });

    return (
      <Popup
        visible={modal.visible}
        bodyClassName={styles.grammarAnalysisModalBody}
        afterClose={() => modal.remove()}
        destroyOnClose
        mask={false}
        position="bottom"
        bodyStyle={{
          borderTopLeftRadius: 'var(--radius-xl)',
          borderTopRightRadius: 'var(--radius-xl)',
          maxHeight: '60vh',
          overflow: 'auto',
        }}
      >
        <div ref={modalRef}>
          <GrammarAnalysis
            text={text}
            autoAnalyze={autoAnalyze}
            onAnalysisComplete={onAnalysisComplete}
          />
        </div>
      </Popup>
    );
  },
);
