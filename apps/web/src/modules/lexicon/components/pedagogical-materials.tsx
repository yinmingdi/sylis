import { BookOpen, Section } from "@sylis/components";
import { useQuery } from "@tanstack/react-query";

import { lexiconQueries } from "..";
import { asArray, asRecord, stringValue } from "../../../pages/page-values";

const materialLabels: Record<string, string> = {
  LEARNER_EXPLANATION: "学习释义",
  MORPHOLOGY_WALKTHROUGH: "词形拆解",
  CULTURAL_CONTEXT: "文化语境",
  MNEMONIC: "记忆线索",
  MICRO_STORY: "微型故事",
};

export function PedagogicalMaterials({
  targetKind,
  targetId,
}: {
  targetKind: "ENTRY" | "SENSE";
  targetId: string;
}) {
  const query = useQuery(lexiconQueries.materials(targetKind, targetId));
  const materials = asArray(query.data).map(asRecord);
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
          <article key={stringValue(material.id, String(index))}>
            <header>
              <strong>
                {materialLabels[stringValue(material.kind)] ??
                  stringValue(material.kind)}
              </strong>
              <span>{stringValue(material.supportLanguageTag)}</span>
            </header>
            {asArray(material.blocks)
              .map(asRecord)
              .map((block, blockIndex) => (
                <MaterialBlock
                  key={stringValue(block.id, String(blockIndex))}
                  block={block}
                />
              ))}
          </article>
        ))}
      </div>
    </Section>
  );
}

function MaterialBlock({ block }: { block: Record<string, unknown> }) {
  const text = stringValue(block.text, "");
  const example = asRecord(block.example);
  const media = asRecord(block.media);
  const uri = stringValue(media.contentUri, "");
  const mimeType = stringValue(media.mimeType, "");
  return (
    <div className="pedagogical-block" data-role={stringValue(block.roleCode)}>
      {text ? <p>{text}</p> : null}
      {example.text ? (
        <blockquote>
          <p>{stringValue(example.text)}</p>
          {asArray(example.translations)
            .map(asRecord)
            .map((translation) => (
              <footer key={stringValue(translation.id)}>
                {stringValue(translation.text)}
              </footer>
            ))}
        </blockquote>
      ) : null}
      {uri && mimeType.startsWith("audio/") ? (
        <audio controls preload="none" src={uri} />
      ) : null}
      {uri && mimeType.startsWith("image/") ? (
        <img src={uri} alt="" loading="lazy" />
      ) : null}
      {asArray(block.citations).length > 0 ? (
        <small>{asArray(block.citations).length} 条来源证据</small>
      ) : null}
    </div>
  );
}
