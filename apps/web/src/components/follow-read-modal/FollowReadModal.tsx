import { Popup } from 'antd-mobile';
import React from 'react';

import FollowRead from '../follow-read';
import type { FollowReadProps, AssessmentResult } from '../follow-read';
import styles from './index.module.less';

export interface FollowReadModalProps extends Omit<FollowReadProps, 'className'> {
  /** 是否显示模态框 */
  visible: boolean;
  /** 关闭模态框回调 */
  onClose?: () => void;
  /** 是否在评估完成后自动关闭 */
  autoCloseOnComplete?: boolean;
}

const FollowReadModal: React.FC<FollowReadModalProps> = ({
  visible,
  onClose,
  autoCloseOnComplete = false,
  onAssessmentComplete,
  ...followReadProps
}) => {
  const handleAssessmentComplete = (result: AssessmentResult) => {
    onAssessmentComplete?.(result);

    if (autoCloseOnComplete) {
      // 延迟关闭，让用户看到结果
      setTimeout(() => {
        onClose?.();
      }, 2000);
    }
  };

  return (
    <Popup
      visible={visible}
      onMaskClick={() => onClose?.()}
      afterClose={() => onClose?.()}
      destroyOnClose
      position="bottom"
      bodyStyle={{
        borderTopLeftRadius: 'var(--radius-xl)',
        borderTopRightRadius: 'var(--radius-xl)',
        maxHeight: '80vh',
        overflow: 'auto',
        padding: 0,
      }}
    >
      <div className={styles.modalContent}>
        <FollowRead
          {...followReadProps}
          onAssessmentComplete={handleAssessmentComplete}
          className="modalMode"
        />
      </div>
    </Popup>
  );
};

export default FollowReadModal;
