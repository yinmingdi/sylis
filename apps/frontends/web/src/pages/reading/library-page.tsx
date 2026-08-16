import {
  Bookmark,
  History,
  PageHeader,
  SegmentedControl,
} from '@sylis/components';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useCurrentUserId } from '../../modules/identity';
import { readingQueries } from '../../modules/reading';
import { RemoteState } from '../page-utils';
import { asArray, asRecord, stringValue } from '../page-values';

export function ReadingLibraryPage() {
  const userId = useCurrentUserId();
  const [view, setView] = useState<'saved' | 'history'>('saved');
  const saved = useQuery(readingQueries.library(userId));
  const history = useQuery(readingQueries.history(userId));
  const active = view === 'saved' ? saved : history;
  const rows = asArray(active.data).map(asRecord);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Reading"
        title="阅读记录"
        actions={
          <SegmentedControl
            label="阅读记录视图"
            value={view}
            onChange={setView}
            options={[
              { value: 'saved', label: '收藏' },
              { value: 'history', label: '历史' },
            ]}
          />
        }
      />
      <RemoteState
        pending={active.isPending}
        error={active.error}
        empty={!active.isPending && rows.length === 0}
      >
        <div className="conversation-list">
          {rows.map((row, index) => {
            const document = asRecord(row.document);
            const revision = asRecord(document.currentRevision);
            return (
              <Link
                key={stringValue(row.id ?? row.documentId, String(index))}
                to={`/reading/${stringValue(row.documentId ?? document.id)}`}
              >
                {view === 'saved' ? <Bookmark /> : <History />}
                <strong>{stringValue(revision.title, '阅读')}</strong>
                <span>{stringValue(row.lastReadAt ?? row.createdAt)}</span>
              </Link>
            );
          })}
        </div>
      </RemoteState>
    </div>
  );
}
