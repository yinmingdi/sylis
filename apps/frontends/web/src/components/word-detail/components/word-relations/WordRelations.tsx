import styles from './index.module.less';

interface WordRelation {
  id: string;
  relatedWord: string;
  meaningCn: string;
  pos?: string;
}

interface WordRelationsProps {
  relations: WordRelation[];
}

const WordRelations = ({ relations }: WordRelationsProps) => {
  // 按词性分组
  const groupedRelations = relations.reduce(
    (acc, relation) => {
      const pos = relation.pos || '其他';
      if (!acc[pos]) {
        acc[pos] = [];
      }
      acc[pos].push(relation);
      return acc;
    },
    {} as Record<string, WordRelation[]>,
  );

  return (
    <div className={styles.wordRelations}>
      {Object.entries(groupedRelations).map(([pos, items]) => (
        <div key={pos} className={styles.relationGroup}>
          <div className={styles.pos}>{pos}.</div>
          <div className={styles.relationList}>
            {items.map((relation, index) => (
              <div key={relation.id} className={styles.relationItem}>
                <span className={styles.word}>{relation.relatedWord}</span>
                <span className={styles.meaning}>{relation.meaningCn}</span>
                {index < items.length - 1 && (
                  <span className={styles.separator}>, </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default WordRelations;
