import { AgentResourceKind, CapabilityKey } from '@sylis/api-client/agent';
import {
  LexicalTargetKind,
  type LexiconFormView,
  type LexiconSenseTreeView,
} from '@sylis/api-client/user';
import { PageHeader, Section, Volume2 } from '@sylis/components';
import { useQuery } from '@tanstack/react-query';
import { Fragment } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AgentContextLink } from '../../modules/agent';
import { lexiconQueries } from '../../modules/lexicon';
import { NotebookTargetAction } from '../../modules/notebooks';
import { RemoteState } from '../page-utils';

export function HeadwordPage() {
  const { id = '' } = useParams();
  const query = useQuery(lexiconQueries.headword(id));
  const headword = query.data?.data;
  const entries = headword?.entries ?? [];
  const title = headword?.displayText ?? '词条';
  const releaseId = query.data?.releaseId;
  return (
    <div className="page lexicon-page">
      <PageHeader
        eyebrow="Headword"
        title={title}
        actions={
          id && releaseId ? (
            <div className="page-header-actions">
              <NotebookTargetAction kind={LexicalTargetKind.HEADWORD} id={id} />
              <AgentContextLink
                capability={CapabilityKey.LEXICON_EXPLAIN}
                label={title}
                detail="词头"
                contextRef={{
                  kind: AgentResourceKind.LEXICON_HEADWORD,
                  id,
                  revisionId: releaseId,
                }}
              />
            </div>
          ) : null
        }
      />
      <RemoteState pending={query.isPending} error={query.error}>
        {entries.map((entry) => (
          <Section key={entry.entryId}>
            <div className="entry-heading">
              <div>
                <span>{entry.partOfSpeechCode}</span>
                <h2>{entry.entryType}</h2>
              </div>
              <Link to={`/lexicon/entries/${entry.entryId}`}>完整词条</Link>
            </div>
            <FormSummary forms={entry.forms} />
            <SenseList senses={entry.senses} />
          </Section>
        ))}
      </RemoteState>
    </div>
  );
}

function FormSummary({ forms }: { forms: LexiconFormView[] }) {
  return (
    <div className="form-strip">
      {forms.map((form) => (
        <Fragment key={form.id}>
          {form.representations.map((representation) => (
            <span key={representation.id}>
              {representation.representationType}{' '}
              <strong>{representation.text}</strong>
              {representation.representationType === 'PHONETIC' ? (
                <Volume2 size={15} aria-hidden="true" />
              ) : null}
            </span>
          ))}
          {form.media.map((link) =>
            link.media.mimeType.startsWith('audio/') ? (
              <audio
                key={`${form.id}:${link.media.id}:${link.roleCode}`}
                aria-label={`${link.regionTag ?? '通用'}发音`}
                controls
                preload="none"
                src={link.media.contentUri}
              />
            ) : null,
          )}
        </Fragment>
      ))}
    </div>
  );
}

function SenseList({
  senses,
  nested = false,
}: {
  senses: LexiconSenseTreeView[];
  nested?: boolean;
}) {
  return (
    <ol className={nested ? 'sense-list sense-list--nested' : 'sense-list'}>
      {senses.map((sense) => {
        const senseId = sense.senseId;
        const children = sense.children;
        return (
          <li key={senseId}>
            <Link to={`/lexicon/senses/${senseId}`}>
              <div>
                {sense.definitions.map((definition) => (
                  <p key={definition.id}>{definition.text}</p>
                ))}
              </div>
              <div className="translation-list">
                {sense.translations.map((translation) => (
                  <span key={translation.id}>{translation.text}</span>
                ))}
              </div>
            </Link>
            {children.length > 0 ? (
              <SenseList senses={children} nested />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
