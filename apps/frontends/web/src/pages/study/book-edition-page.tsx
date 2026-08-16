import {
  ArrowLeft,
  Button,
  DataList,
  Field,
  PageHeader,
  TextInput,
} from '@sylis/components';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { booksCommands, booksQueries } from '../../modules/books';
import { useCurrentUserId } from '../../modules/identity';
import { RemoteState } from '../page-utils';
import { asArray, asRecord, stringValue } from '../page-values';

const targetPath = (kind: string, id: string) => {
  if (kind === 'HEADWORD') return `/lexicon/headwords/${id}`;
  if (kind === 'ENTRY') return `/lexicon/entries/${id}`;
  if (kind === 'SENSE') return `/lexicon/senses/${id}`;
  return `/lexicon/search?q=${encodeURIComponent(id)}`;
};

export function BookEditionPage() {
  const userId = useCurrentUserId();
  const { bookId = '', editionId = '' } = useParams();
  const query = useInfiniteQuery(booksQueries.edition(bookId, editionId));
  const enrollments = useQuery(booksQueries.enrollments(userId));
  const cache = useQueryClient();
  const [dailyNewLimit, setDailyNewLimit] = useState('20');
  const pages = query.data?.pages ?? [];
  const edition = asRecord(pages[0]);
  const book = asRecord(edition.book);
  const items = pages
    .flatMap((page) => asArray(asRecord(page).items))
    .map(asRecord);
  const active = asArray(enrollments.data)
    .map(asRecord)
    .find((item) => item.bookId === bookId && item.active === true);
  const enroll = useMutation({
    mutationFn: () =>
      booksCommands.enroll({
        bookId,
        editionId,
        dailyNewLimit: Number(dailyNewLimit),
      }),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: booksQueries.enrollments(userId).queryKey,
      }),
  });
  const migrate = useMutation({
    mutationFn: (confirm: boolean) =>
      booksCommands.migrateEnrollment(
        stringValue(active?.id),
        editionId,
        confirm,
      ),
    onSuccess: (_value, confirm) => {
      if (confirm) {
        void cache.invalidateQueries({
          queryKey: booksQueries.enrollments(userId).queryKey,
        });
      }
    },
  });

  return (
    <div className="page">
      <PageHeader
        eyebrow={stringValue(edition.version, 'Edition')}
        title={stringValue(book.title, '词书版本')}
        actions={
          <Button icon={ArrowLeft} tone="quiet" onClick={() => history.back()}>
            返回
          </Button>
        }
      />
      <RemoteState pending={query.isPending} error={query.error}>
        <div className="edition-toolbar">
          <div>
            <strong>{stringValue(edition.contentHash)}</strong>
            <small>{items.length} 个已加载条目</small>
          </div>
          <Field label="每日新词">
            <TextInput
              type="number"
              min="1"
              max="200"
              value={dailyNewLimit}
              onChange={(event) => setDailyNewLimit(event.target.value)}
            />
          </Field>
          {!active ? (
            <Button disabled={enroll.isPending} onClick={() => enroll.mutate()}>
              加入学习
            </Button>
          ) : active.editionId === editionId ? (
            <div className="edition-active-actions">
              <span className="result-correct">当前学习版本</span>
              <Link to="/study">开始学习</Link>
            </div>
          ) : (
            <Button tone="secondary" onClick={() => migrate.mutate(false)}>
              迁移到此版本
            </Button>
          )}
        </div>
        {migrate.data && asRecord(migrate.data).status === 'PREVIEW' ? (
          <div className="migration-preview">
            <span>
              目标版本共 {stringValue(asRecord(migrate.data).targetItemCount)}{' '}
              项
            </span>
            <Button tone="danger" onClick={() => migrate.mutate(true)}>
              确认迁移
            </Button>
          </div>
        ) : null}
        <DataList
          rows={items.map((item) => ({
            label: `${String(item.position).padStart(5, '0')} · ${stringValue(item.targetKind)}`,
            value: (
              <Link
                to={targetPath(
                  stringValue(item.targetKind),
                  stringValue(item.targetId),
                )}
              >
                {stringValue(item.displayText, stringValue(item.targetId))}
              </Link>
            ),
            detail: stringValue(item.detail),
          }))}
        />
        {query.hasNextPage ? (
          <div className="submit-row">
            <Button
              tone="secondary"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? '加载中' : '加载更多'}
            </Button>
          </div>
        ) : null}
      </RemoteState>
    </div>
  );
}
