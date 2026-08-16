import { AgentResourceKind, CapabilityKey } from '@sylis/api-client/agent';
import {
  LexicalTargetKind,
  type LexiconConceptReferenceView,
  type LexiconSenseReferenceView,
} from '@sylis/api-client/user';
import { DataList, PageHeader, Section } from '@sylis/components';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { AgentContextLink } from '../../modules/agent';
import { lexiconQueries } from '../../modules/lexicon';
import { PedagogicalMaterials } from '../../modules/lexicon/components/pedagogical-materials';
import { NotebookTargetAction } from '../../modules/notebooks';
import { RemoteState } from '../page-utils';

export function SensePage() {
  const { id = '' } = useParams();
  const query = useQuery(lexiconQueries.sense(id));
  const sense = query.data?.data;
  const definitions = sense?.definitions ?? [];
  const translations = sense?.translations ?? [];
  const examples = sense?.examples ?? [];
  const collocations = sense?.collocations ?? [];
  const usages = sense?.usages ?? [];
  const children = sense?.children ?? [];
  const memberships = sense?.memberships ?? [];
  const frames = sense?.frames ?? [];
  const relations = sense
    ? [
        ...sense.outgoingRelations.map((relation) => ({
          ...relation,
          related: relation.target,
        })),
        ...sense.incomingRelations.map((relation) => ({
          ...relation,
          related: relation.source,
        })),
      ]
    : [];
  const translationRelations = sense
    ? [
        ...sense.outgoingTranslations.map((relation) => ({
          ...relation,
          related: relation.target,
        })),
        ...sense.incomingTranslations.map((relation) => ({
          ...relation,
          related: relation.source,
        })),
      ]
    : [];
  const conceptRelations = memberships.flatMap((membership) => [
    ...membership.conceptRevision.outgoingRelations.map((relation) => ({
      ...relation,
      related: relation.target,
    })),
    ...membership.conceptRevision.incomingRelations.map((relation) => ({
      ...relation,
      related: relation.source,
    })),
  ]);
  const title = sense?.entryRevision.headwordRevision.displayText ?? '义项';
  const summary = definitions.map((row) => row.text).join('；');
  const releaseId = query.data?.releaseId;

  return (
    <div className="page lexicon-page">
      <PageHeader
        eyebrow={
          sense ? `${sense.entryRevision.partOfSpeechCode} · Sense` : 'Sense'
        }
        title={title}
        actions={
          id && releaseId ? (
            <div className="page-header-actions">
              <NotebookTargetAction kind={LexicalTargetKind.SENSE} id={id} />
              <AgentContextLink
                capability={CapabilityKey.LEXICON_EXPLAIN}
                label={title}
                detail={summary || '义项'}
                contextRef={{
                  kind: AgentResourceKind.LEXICON_SENSE,
                  id,
                  revisionId: releaseId,
                }}
              />
            </div>
          ) : null
        }
      />
      <RemoteState pending={query.isPending} error={query.error}>
        <Section>
          <h2>释义与译文</h2>
          <DataList
            rows={[
              ...definitions.map((definition, index) => ({
                label: `${definition.languageTag} · ${definition.definitionType} ${index + 1}`,
                value: definition.text,
              })),
              ...translations.map((translation, index) => ({
                label: `${translation.languageTag} · 译文 ${index + 1}`,
                value: translation.text,
                detail: translation.registerCode ?? undefined,
              })),
            ]}
          />
        </Section>
        {usages.length > 0 ? (
          <Section>
            <h2>用法限制</h2>
            <DataList
              rows={usages.map((usage, index) => ({
                label: `${usage.usageTypeCode} ${index + 1}`,
                value: usage.text ?? usage.valueCode ?? '',
                detail: usage.text ? (usage.valueCode ?? undefined) : undefined,
              }))}
            />
          </Section>
        ) : null}
        {examples.length > 0 ? (
          <Section>
            <h2>例句</h2>
            <div className="example-list">
              {examples.map((link) => (
                <blockquote key={link.id}>
                  <p>{link.example.text}</p>
                  {link.example.translations.map((translation) => (
                    <footer key={translation.id}>{translation.text}</footer>
                  ))}
                  {link.example.citations.length > 0 ? (
                    <cite>
                      {link.example.citations
                        .map((citation) =>
                          [
                            citation.workTitle,
                            citation.location,
                            citation.year,
                            citation.examType,
                          ]
                            .filter(Boolean)
                            .join(' · '),
                        )
                        .filter(Boolean)
                        .join('；')}
                    </cite>
                  ) : null}
                </blockquote>
              ))}
            </div>
          </Section>
        ) : null}
        {collocations.length > 0 ? (
          <Section>
            <h2>搭配</h2>
            <DataList
              rows={collocations.map((link) => ({
                label: link.relationType,
                value: link.collocation.canonicalText,
                detail: [
                  link.collocation.components
                    .map(
                      (component) =>
                        `${component.surfaceText} (${component.roleCode})`,
                    )
                    .join(' + '),
                  ...link.collocation.observations.map(
                    (observation) =>
                      `${observation.measureCode} ${observation.score}`,
                  ),
                ]
                  .filter(Boolean)
                  .join(' · '),
              }))}
            />
          </Section>
        ) : null}
        {frames.length > 0 ? (
          <Section>
            <h2>语法与语义角色</h2>
            <DataList
              rows={frames.map((binding, index) => ({
                label: `${binding.frame.frameTypeCode} ${index + 1}`,
                value: binding.frame.displayTemplate,
                detail: [
                  binding.predicate
                    ? `${binding.predicate.label ?? binding.predicate.predicateKey} · ${binding.predicate.predicateTypeCode}`
                    : '',
                  ...binding.mappings.map(
                    (mapping) =>
                      `${mapping.syntacticArgument.functionCode} → ${mapping.semanticArgument.roleCode}`,
                  ),
                ]
                  .filter(Boolean)
                  .join(' · '),
              }))}
            />
          </Section>
        ) : null}
        {sense?.parent || children.length > 0 ? (
          <Section>
            <h2>义项层级</h2>
            <DataList
              rows={[
                ...(sense?.parent
                  ? [
                      {
                        label: '上位义项',
                        value: <SenseReference reference={sense.parent} />,
                      },
                    ]
                  : []),
                ...children.map((child, index) => ({
                  label: `细分义项 ${index + 1}`,
                  value: <SenseReference reference={child} />,
                })),
              ]}
            />
          </Section>
        ) : null}
        {memberships.length > 0 ? (
          <Section>
            <h2>概念归属</h2>
            <DataList
              rows={memberships.map((membership, index) => ({
                label: `${membership.membershipType} ${index + 1}`,
                value: conceptText(membership.conceptRevision),
                detail: membership.canonical ? '规范概念' : '关联概念',
              }))}
            />
          </Section>
        ) : null}
        {conceptRelations.length > 0 ? (
          <Section>
            <h2>概念关系</h2>
            <DataList
              rows={conceptRelations.map((relation, index) => ({
                label: `${relation.typeCode} ${index + 1}`,
                value: conceptText(relation.related),
                detail: relation.direction,
              }))}
            />
          </Section>
        ) : null}
        {relations.length > 0 ? (
          <Section>
            <h2>语义关系</h2>
            <DataList
              rows={relations.map((relation, index) => ({
                label: `${relation.typeCode} ${index + 1}`,
                value: <SenseReference reference={relation.related} />,
                detail: relation.direction,
              }))}
            />
          </Section>
        ) : null}
        {translationRelations.length > 0 ? (
          <Section>
            <h2>跨语言对应</h2>
            <DataList
              rows={translationRelations.map((relation, index) => ({
                label: `${relation.translationType} ${index + 1}`,
                value: <SenseReference reference={relation.related} />,
              }))}
            />
          </Section>
        ) : null}
        {id ? <PedagogicalMaterials targetKind="SENSE" targetId={id} /> : null}
      </RemoteState>
    </div>
  );
}

function SenseReference({
  reference,
}: {
  reference: LexiconSenseReferenceView;
}) {
  const detail =
    reference.translations.map((translation) => translation.text).join('；') ||
    reference.definitions.map((definition) => definition.text).join('；');
  return (
    <Link to={`/lexicon/senses/${reference.senseId}`}>
      {reference.entryRevision.headwordRevision.displayText}
      {detail ? ` · ${detail}` : ''}
    </Link>
  );
}

function conceptText(concept: LexiconConceptReferenceView): string {
  return (
    concept.definitions.map((definition) => definition.text).join('；') ||
    concept.conceptType
  );
}
