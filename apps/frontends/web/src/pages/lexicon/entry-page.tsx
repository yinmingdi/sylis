import { AgentResourceKind, CapabilityKey } from '@sylis/api-client/agent';
import {
  LexicalTargetKind,
  type LexiconEntryReferenceView,
  type LexiconEtymologyHypothesisView,
  type LexiconFormView,
} from '@sylis/api-client/user';
import { DataList, PageHeader, Section } from '@sylis/components';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { AgentContextLink } from '../../modules/agent';
import { lexiconQueries } from '../../modules/lexicon';
import { PedagogicalMaterials } from '../../modules/lexicon/components/pedagogical-materials';
import { NotebookTargetAction } from '../../modules/notebooks';
import { RemoteState } from '../page-utils';

export function EntryPage() {
  const { id = '' } = useParams();
  const query = useQuery(lexiconQueries.entry(id));
  const entry = query.data?.data;
  const forms = entry?.forms ?? [];
  const senses = entry?.senses ?? [];
  const frames = entry?.frames ?? [];
  const collocations = entry?.headedCollocations ?? [];
  const inflections = entry?.inflectionGenerations ?? [];
  const formations = entry?.wordFormations ?? [];
  const family = entry?.wordFormationInputs ?? [];
  const etymologies = entry?.etymologyHypotheses ?? [];
  const relations = entry
    ? [
        ...entry.outgoingRelations.map((relation) => ({
          ...relation,
          related: relation.target,
        })),
        ...entry.incomingRelations.map((relation) => ({
          ...relation,
          related: relation.source,
        })),
      ]
    : [];
  const title = entry?.headwordRevision.displayText ?? '词条';
  const releaseId = query.data?.releaseId;

  return (
    <div className="page lexicon-page">
      <PageHeader
        eyebrow={entry?.partOfSpeechCode ?? 'Entry'}
        title={title}
        actions={
          id && releaseId ? (
            <div className="page-header-actions">
              <NotebookTargetAction kind={LexicalTargetKind.ENTRY} id={id} />
              <AgentContextLink
                capability={CapabilityKey.LEXICON_EXPLAIN}
                label={title}
                detail={entry?.partOfSpeechCode ?? '词条'}
                contextRef={{
                  kind: AgentResourceKind.LEXICON_ENTRY,
                  id,
                  revisionId: releaseId,
                }}
              />
            </div>
          ) : null
        }
      />
      <RemoteState pending={query.isPending} error={query.error}>
        {forms.length > 0 ? <FormsSection forms={forms} title={title} /> : null}
        {inflections.length > 0 ? (
          <Section>
            <h2>词形变化</h2>
            <DataList
              rows={inflections.map((generation, index) => ({
                label: generation.rule.ruleType || `变化 ${index + 1}`,
                value: `${formText(generation.baseForm)} → ${formText(generation.outputForm)}`,
                detail: `${generation.rule.ruleKey} · ${generation.rule.version}`,
              }))}
            />
          </Section>
        ) : null}
        {senses.length > 0 ? (
          <Section>
            <h2>义项</h2>
            <div className="sense-index">
              {senses.map((sense, index) => (
                <Link
                  key={sense.senseId}
                  to={`/lexicon/senses/${sense.senseId}`}
                >
                  <span>{index + 1}</span>
                  <strong>
                    {sense.definitions.map((row) => row.text).join('；')}
                  </strong>
                  <small>
                    {sense.translations.map((row) => row.text).join('；')}
                  </small>
                </Link>
              ))}
            </div>
          </Section>
        ) : null}
        {collocations.length > 0 ? (
          <Section>
            <h2>词组搭配</h2>
            <DataList
              rows={collocations.map((collocation) => ({
                label: collocation.canonicalText,
                value: collocation.components
                  .map((component) => component.surfaceText)
                  .join(' + '),
                detail: collocation.components
                  .map((component) => component.roleCode)
                  .join(' · '),
              }))}
            />
          </Section>
        ) : null}
        {frames.length > 0 ? (
          <Section>
            <h2>句法框架</h2>
            <DataList
              rows={frames.map((frame) => ({
                label: frame.frameTypeCode,
                value: frame.displayTemplate,
                detail: frame.arguments
                  .map(
                    (argument) =>
                      `${argument.functionCode}: ${argument.phraseTypeCode}${argument.marker ? ` ${argument.marker}` : ''}${argument.optional ? '（可选）' : ''}`,
                  )
                  .join(' · '),
              }))}
            />
          </Section>
        ) : null}
        {formations.length > 0 || family.length > 0 ? (
          <Section>
            <h2>构词与词族</h2>
            <DataList
              rows={[
                ...formations.map((formation, index) => ({
                  label: `构词 ${index + 1}`,
                  value: `${formation.inputs.map(formationInputText).join(' + ')} → ${title}`,
                  detail: [
                    formation.formationTypeCode,
                    ...formation.applications.map(
                      (application) => application.rule.ruleKey,
                    ),
                  ].join(' · '),
                })),
                ...family.map((input, index) => ({
                  label: `词族 ${index + 1}`,
                  value: (
                    <Link
                      to={`/lexicon/entries/${input.formation.targetEntry.entryId}`}
                    >
                      {input.formation.targetEntry.headwordRevision.displayText}
                    </Link>
                  ),
                  detail: `${input.formation.formationTypeCode} · ${input.roleCode}`,
                })),
              ]}
            />
          </Section>
        ) : null}
        {etymologies.length > 0 ? (
          <Section>
            <h2>词源</h2>
            <DataList
              rows={etymologies.map((hypothesis, index) => ({
                label: `${hypothesis.hypothesisType} ${index + 1}`,
                value: hypothesis.links
                  .map(etymologyLinkText)
                  .filter(Boolean)
                  .join('；'),
                detail: hypothesis.status,
              }))}
            />
          </Section>
        ) : null}
        {relations.length > 0 ? (
          <Section>
            <h2>词条关系</h2>
            <DataList
              rows={relations.map((relation, index) => ({
                label: `${relation.typeCode} ${index + 1}`,
                value: <EntryReference reference={relation.related} />,
                detail: relation.direction,
              }))}
            />
          </Section>
        ) : null}
        {id ? <PedagogicalMaterials targetKind="ENTRY" targetId={id} /> : null}
      </RemoteState>
    </div>
  );
}

function FormsSection({
  forms,
  title,
}: {
  forms: LexiconFormView[];
  title: string;
}) {
  const analyses = forms.flatMap((form) =>
    form.representations.flatMap((representation) =>
      representation.analyses.map((analysis) => ({
        ...analysis,
        representation: representation.text,
      })),
    ),
  );
  const media = forms.flatMap((form) => form.media);
  return (
    <>
      <Section>
        <h2>词形</h2>
        <DataList
          rows={forms.map((form, index) => ({
            label: `${form.formType} ${index + 1}`,
            value: form.representations
              .map(
                (representation) =>
                  `${representation.text}${representation.regionTag ? ` (${representation.regionTag})` : ''}`,
              )
              .join(' · '),
            detail: form.features
              .map((feature) => `${feature.featureCode}=${feature.valueCode}`)
              .join(' · '),
          }))}
        />
      </Section>
      {analyses.length > 0 ? (
        <Section>
          <h2>形态结构</h2>
          <DataList
            rows={analyses.map((analysis, index) => ({
              label: `${analysis.analysisType} ${index + 1}`,
              value:
                analysis.segments.length > 0
                  ? analysis.segments
                      .map((segment) => segment.surfaceText)
                      .join(' + ')
                  : analysis.representation,
              detail: analysis.segments
                .map(
                  (segment) =>
                    `${segment.roleCode}: ${segment.morpheme?.identityKey ?? segment.morph?.morpheme?.identityKey ?? segment.morph?.identityKey ?? segment.surfaceText}`,
                )
                .join(' · '),
            }))}
          />
        </Section>
      ) : null}
      {media.length > 0 ? (
        <Section>
          <h2>发音与媒体</h2>
          <div className="lexicon-media-list">
            {media.map((link) => {
              const label = `${title} ${link.regionTag ?? link.roleCode}`;
              if (link.media.mimeType.startsWith('audio/')) {
                return (
                  <div key={`${link.media.id}:${link.roleCode}`}>
                    <span>{label}</span>
                    <audio
                      aria-label={label}
                      controls
                      preload="none"
                      src={link.media.contentUri}
                    />
                  </div>
                );
              }
              if (link.media.mimeType.startsWith('image/')) {
                return (
                  <img
                    key={`${link.media.id}:${link.roleCode}`}
                    src={link.media.contentUri}
                    alt={label}
                    loading="lazy"
                  />
                );
              }
              return null;
            })}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function EntryReference({
  reference,
}: {
  reference: LexiconEntryReferenceView;
}) {
  return (
    <Link to={`/lexicon/entries/${reference.entryId}`}>
      {reference.headwordRevision.displayText}
      {reference.partOfSpeechCode ? ` · ${reference.partOfSpeechCode}` : ''}
    </Link>
  );
}

function formationInputText(input: {
  inputEntry: LexiconEntryReferenceView | null;
  morpheme: { identityKey: string } | null;
  roleCode: string;
}): string {
  return (
    input.inputEntry?.headwordRevision.displayText ??
    input.morpheme?.identityKey ??
    input.roleCode
  );
}

function formText(form: { representations: Array<{ text: string }> }): string {
  return form.representations
    .map((representation) => representation.text)
    .join('/');
}

function etymologyLinkText(
  link: LexiconEtymologyHypothesisView['links'][number],
): string {
  const source = [
    ...link.sourceEntries.map(
      ({ entry }) => entry.headwordRevision.displayText,
    ),
    ...link.sourceEtymons.map(
      ({ etymon }) =>
        `${etymon.languageTag} ${etymon.form}${etymon.gloss ? ` “${etymon.gloss}”` : ''}`,
    ),
  ].join(' + ');
  const target = [
    ...link.targetEntries.map(
      ({ entry }) => entry.headwordRevision.displayText,
    ),
    ...link.targetEtymons.map(
      ({ etymon }) =>
        `${etymon.languageTag} ${etymon.form}${etymon.gloss ? ` “${etymon.gloss}”` : ''}`,
    ),
  ].join(' + ');
  return [source, link.linkType, target].filter(Boolean).join(' → ');
}
