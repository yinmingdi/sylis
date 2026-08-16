import { AgentResourceKind, CapabilityKey } from '@sylis/api-client/agent';
import { ConsentPurpose } from '@sylis/api-client/user';
import {
  Activity,
  BookOpen,
  Button,
  Clock,
  History,
  ProgressBar,
  Search,
} from '@sylis/components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AgentContextLink } from '../../modules/agent';
import { booksQueries } from '../../modules/books';
import { ExercisePlayer } from '../../modules/exercises';
import {
  activeConsentId,
  consentsQuery,
  useCurrentUserId,
} from '../../modules/identity';
import { JobProgress } from '../../modules/jobs';
import { studyCommands, studyQueries } from '../../modules/study';
import { RemoteState } from '../page-utils';
import { asArray, asRecord, stringValue } from '../page-values';

const numericValue = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export function TodayPage() {
  const userId = useCurrentUserId();
  const query = useQuery(studyQueries.today(userId));
  const statsQuery = useQuery(studyQueries.stats(userId));
  const enrollmentQuery = useQuery(booksQueries.enrollments(userId));
  const consents = useQuery(consentsQuery(userId));
  const navigate = useNavigate();
  const [awaitingReview, setAwaitingReview] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const attempt = useMutation({
    mutationFn: (planItemId: string) =>
      studyCommands.createAttempt(planItemId, crypto.randomUUID()),
  });
  const generate = useMutation({
    mutationFn: () => studyCommands.generateToday(crypto.randomUUID()),
  });
  const review = useMutation({
    mutationFn: (rating: number) => {
      if (!attempt.data) throw new Error('LEARNING_ATTEMPT_REQUIRED');
      return studyCommands.submitReview(
        attempt.data.id,
        rating,
        crypto.randomUUID(),
      );
    },
    onSuccess: async () => {
      setAwaitingReview(false);
      setReviewed(true);
      attempt.reset();
      await Promise.all([query.refetch(), statsQuery.refetch()]);
    },
  });

  const plan = asRecord(query.data);
  const items = asArray(plan.items).map(asRecord);
  const completed = items.filter((item) => item.completedAt).length;
  const planId = stringValue(plan.id, '');
  const stats = asRecord(statsQuery.data);
  const enrollments = asArray(enrollmentQuery.data).map(asRecord);
  const enrollment = enrollments.find((item) => item.active === true);
  const book = asRecord(enrollment?.book);
  const edition = asRecord(enrollment?.edition);
  const dailyLimit = numericValue(enrollment?.dailyNewLimit);
  const dueCount = numericValue(stats.due);
  const reviewCount = numericValue(stats.reviews);
  const attemptCount = numericValue(stats.attempts);
  const progress = items.length
    ? Math.round((completed / items.length) * 100)
    : 0;
  const pendingItems = items.filter((item) => !item.completedAt);
  const newItem = pendingItems.find((item) => stringValue(item.mode) === 'NEW');
  const reviewItem = pendingItems.find(
    (item) => stringValue(item.mode) === 'REVIEW',
  );

  const startItem = (item: Record<string, unknown> | undefined) => {
    if (item) attempt.mutate(stringValue(item.id));
  };

  if (attempt.data) {
    return (
      <div className="page practice-page">
        <header className="practice-page__header">
          <button
            type="button"
            onClick={() => attempt.reset()}
            aria-label="返回"
          >
            返回
          </button>
          <strong>
            {completed}/{items.length}
          </strong>
          <span>今日学习</span>
        </header>
        <ExercisePlayer
          attempt={attempt.data}
          consentRecordId={activeConsentId(
            consents.data,
            ConsentPurpose.LEARNING_RESPONSE_RETENTION,
          )}
          onSubmit={studyCommands.submitResponse}
          onResult={() => setAwaitingReview(true)}
        />
        {awaitingReview ? (
          <section className="review-rating" aria-label="掌握程度评分">
            <h2>这个单词掌握得怎么样？</h2>
            <div>
              <Button onClick={() => review.mutate(0)}>忘记</Button>
              <Button onClick={() => review.mutate(1)}>困难</Button>
              <Button onClick={() => review.mutate(2)}>良好</Button>
              <Button onClick={() => review.mutate(3)}>熟练</Button>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="page learning-home">
      <Link className="learning-search" to="/lexicon/search">
        <Search aria-hidden="true" size={19} />
        <span>输入中英文，查词、翻译、润色...</span>
      </Link>

      <RemoteState
        pending={enrollmentQuery.isPending}
        error={enrollmentQuery.error}
      >
        {enrollment ? (
          <section className="current-book" aria-label="当前词书">
            <div className="current-book__icon">
              <BookOpen aria-hidden="true" size={22} />
            </div>
            <div className="current-book__body">
              <div className="current-book__title">
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/study/books/${stringValue(book.id)}/editions/${stringValue(edition.id)}`,
                    )
                  }
                >
                  {stringValue(book.title, '当前词书')}
                </button>
                <Button
                  tone="secondary"
                  onClick={() => navigate('/study/books')}
                >
                  切换词书
                </Button>
              </div>
              <div className="current-book__meta">
                <span>今日 {dailyLimit || items.length} 词</span>
                <span>进度 {progress}%</span>
              </div>
              <ProgressBar value={progress} label="词书学习进度" />
            </div>
          </section>
        ) : (
          <section className="current-book current-book--empty">
            <BookOpen aria-hidden="true" />
            <div>
              <strong>暂未选择词书</strong>
              <span>选择一本词书开始今天的学习</span>
            </div>
            <Button onClick={() => navigate('/study/books')}>选择词书</Button>
          </section>
        )}
      </RemoteState>

      <div className="learning-actions">
        <Button disabled={!newItem} onClick={() => startItem(newItem)}>
          学习新单词
        </Button>
        <Button
          tone="secondary"
          disabled={!reviewItem}
          onClick={() => startItem(reviewItem)}
        >
          复习单词
        </Button>
      </div>

      <section
        className="learning-statistics"
        aria-labelledby="learning-statistics-title"
      >
        <h2 id="learning-statistics-title">学习统计</h2>
        <div className="learning-statistics__grid">
          <article>
            <History aria-hidden="true" />
            <div>
              <strong>{reviewCount}</strong>
              <span>复习次数</span>
            </div>
          </article>
          <article>
            <Activity aria-hidden="true" />
            <div>
              <strong>{progress}%</strong>
              <span>今日进度</span>
            </div>
          </article>
          <article>
            <BookOpen aria-hidden="true" />
            <div>
              <strong>{attemptCount}</strong>
              <span>完成练习</span>
            </div>
          </article>
          <article>
            <Clock aria-hidden="true" />
            <div>
              <strong>{dueCount}</strong>
              <span>待复习</span>
            </div>
          </article>
        </div>
      </section>

      {!query.isPending && items.length === 0 && !generate.data ? (
        <div className="empty-command">
          <p>今日计划尚未生成。</p>
          <Button onClick={() => generate.mutate()}>生成今日计划</Button>
        </div>
      ) : null}
      {generate.data ? (
        <JobProgress
          jobId={generate.data.id}
          onTerminal={() => void query.refetch()}
        />
      ) : null}

      <RemoteState pending={query.isPending} error={query.error}>
        {items.length ? (
          <section className="daily-objectives" aria-label="今日学习目标">
            <header>
              <div>
                <span>今日计划</span>
                <strong>
                  {completed}/{items.length} 已完成
                </strong>
              </div>
              {planId ? (
                <AgentContextLink
                  capability={CapabilityKey.STUDY_COACH}
                  label="学习建议"
                  detail={`${completed}/${items.length} 已完成`}
                  contextRef={{
                    kind: AgentResourceKind.LEARNING_SUMMARY,
                    id: planId,
                  }}
                />
              ) : null}
            </header>
            <div>
              {items.map((item, index) => {
                const objective = asRecord(item.objective);
                return (
                  <button
                    key={stringValue(item.id, String(index))}
                    onClick={() => startItem(item)}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>
                      {stringValue(objective.knowledgeFacet, '学习目标')}
                    </strong>
                    <small>
                      {item.completedAt
                        ? '已完成'
                        : stringValue(item.mode, '待学习')}
                    </small>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
      </RemoteState>
      {reviewed ? <p role="status">学习进度已更新</p> : null}
    </div>
  );
}
