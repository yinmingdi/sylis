import type { PedagogicalMaterialView } from '@sylis/api-client/user';
import { BookOpen, Section } from '@sylis/components';
import { useQuery } from '@tanstack/react-query';

import { lexiconQueries } from '..';

const materialLabels: Record<string, string> = {
  LEARNER_EXPLANATION: '学习释义',
  MORPHOLOGY_WALKTHROUGH: '词形拆解',
  CULTURAL_CONTEXT: '文化语境',
  MNEMONIC: '记忆线索',
  MICRO_STORY: '微型故事',
};

export function PedagogicalMaterials({
  targetKind,
  targetId,
}: {
  targetKind: 'ENTRY' | 'SENSE';
  targetId: string;
}) {
  const query = useQuery(lexiconQueries.materials(targetKind, targetId));
  const materials = query.data?.data ?? [];
  if (query.isPending)
    return (
      <Section className="pedagogical-materials">
        <h2>
          <BookOpen aria-hidden="true" size={17} /> 学习材料
        </h2>
        <div className="skeleton-lines">
          <span />
          <span />
        </div>
      </Section>
    );
  if (query.isError)
    return (
      <Section className="pedagogical-materials">
        <h2>
          <BookOpen aria-hidden="true" size={17} /> 学习材料
        </h2>
        <p className="form-error">{query.error.message}</p>
      </Section>
    );
  if (materials.length === 0) return null;
  return (
    <Section className="pedagogical-materials">
      <h2>
        <BookOpen aria-hidden="true" size={17} /> 学习材料
      </h2>
      <div className="pedagogical-material-list">
        {materials.map((material, index) => (
          <article key={material.id || String(index)}>
            <header>
              <strong>{materialLabels[material.kind] ?? material.kind}</strong>
              <span>{material.supportLanguageTag}</span>
            </header>
            {material.blocks.map((block, blockIndex) => (
              <MaterialBlock
                key={block.id || String(blockIndex)}
                block={block}
              />
            ))}
          </article>
        ))}
      </div>
    </Section>
  );
}

function MaterialBlock({
  block,
}: {
  block: PedagogicalMaterialView['blocks'][number];
}) {
  const uri = block.media?.contentUri ?? '';
  const mimeType = block.media?.mimeType ?? '';
  return (
    <div className="pedagogical-block" data-role={block.roleCode}>
      {block.text ? <p>{block.text}</p> : null}
      {block.example ? (
        <blockquote>
          <p>{block.example.text}</p>
          {block.example.translations.map((translation) => (
            <footer key={translation.id}>{translation.text}</footer>
          ))}
        </blockquote>
      ) : null}
      {uri && mimeType.startsWith('audio/') ? (
        <audio controls preload="none" src={uri} />
      ) : null}
      {uri && mimeType.startsWith('image/') ? (
        <img src={uri} alt="" loading="lazy" />
      ) : null}
      {uri && mimeType.startsWith('video/') ? (
        <video controls preload="metadata" src={uri} />
      ) : null}
      {block.citations.length > 0 ? (
        <small>{block.citations.length} 条来源证据</small>
      ) : null}
    </div>
  );
}
