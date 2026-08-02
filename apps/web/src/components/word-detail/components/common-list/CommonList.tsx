import styles from './index.module.less';
import { SoundButton } from '../../../index';
import { InteractiveText } from '../../../interactive-text';

export interface CommonListItem {
  id: string;
  primary: string; // 主要内容（英文）
  secondary?: string; // 次要内容（中文）
  metadata?: string; // 元数据（来源等）
  source?: 'LEGACY' | 'ECDICT' | 'DERIVED' | 'AI';
  highlightWord?: string; // 需要高亮的单词
}

interface CommonListProps {
  items: CommonListItem[];
  showAudio?: boolean;
  onPlayAudio?: (item: CommonListItem) => void;
  wordToPlay?: string; // 要播放发音的单词，如果为空则使用 item.primary
}

const CommonList = ({
  items,
  showAudio = false,
  onPlayAudio,
  wordToPlay,
}: CommonListProps) => {
  return (
    <div className={styles.commonList}>
      {items.map((item) => (
        <div key={item.id} className={styles.listItem}>
          <div className={styles.content}>
            <div className={styles.primaryRow}>
              <p className={styles.primaryText}>
                <InteractiveText content={item.primary} />
              </p>
              {showAudio && (
                <SoundButton
                  word={wordToPlay || item.primary}
                  type={2}
                  size="small"
                  onClick={() => onPlayAudio?.(item)}
                />
              )}
            </div>
            {item.secondary && (
              <p className={styles.secondaryText}>{item.secondary}</p>
            )}
            {item.metadata && (
              <p className={styles.metadata}>{item.metadata}</p>
            )}
            {item.source === 'AI' && (
              <span className={styles.sourceBadge}>AI 生成</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CommonList;
