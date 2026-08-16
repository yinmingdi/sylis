import { AgentResourceKind, CapabilityKey } from '@sylis/api-client/agent';
import {
  ReadingActivityKind,
  TextOffsetUnit,
  type RecordReadingActivityInput,
  type ResolveReadingSelectionInput,
} from '@sylis/api-client/user';
import {
  Bookmark,
  Button,
  PageHeader,
  Search,
  Section,
} from '@sylis/components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AgentContextLink } from '../../modules/agent';
import { useCurrentUserId } from '../../modules/identity';
import { readingCommands, readingQueries } from '../../modules/reading';
import { RemoteState } from '../page-utils';
import { asArray, asRecord, stringValue } from '../page-values';

export function ReadingDocumentPage() {
  const userId = useCurrentUserId();
  const { documentId = '' } = useParams();
  const articleRef = useRef<HTMLElement>(null);
  const progressTimerRef = useRef<number | undefined>(undefined);
  const selectedTargetRevisionRef = useRef('');
  const lastProgressRef = useRef({ progress: 0, offset: 0, complete: false });
  const [selectedText, setSelectedText] = useState('');
  const query = useQuery(readingQueries.document(userId, documentId));
  const document = asRecord(query.data);
  const revision = asRecord(
    document.currentRevision ?? asArray(document.revisions)[0],
  );
  const revisionId = stringValue(revision.id, '');
  const revisionContentHash = stringValue(revision.contentHash, '');
  const annotationsQuery = useQuery(
    readingQueries.annotations(userId, revisionId),
  );
  const annotations = asArray(annotationsQuery.data).map(asRecord);
  const targetsQuery = useQuery(readingQueries.targets(userId, revisionId));
  const targets = asArray(targetsQuery.data).map(asRecord);
  const { mutate: selectTargets } = useMutation({
    mutationFn: () => readingCommands.selectTargets(revisionId),
    onSuccess: () => void targetsQuery.refetch(),
  });
  const save = useMutation({
    mutationFn: () => readingCommands.save({ documentId }),
  });
  const { mutate: recordActivity } = useMutation({
    mutationFn: (input: RecordReadingActivityInput) =>
      readingCommands.recordActivity(input),
  });
  const lookup = useMutation({
    mutationFn: (input: ResolveReadingSelectionInput) =>
      readingCommands.resolveSelection(revisionId, input),
    onSuccess: (_result, input) =>
      recordActivity({
        documentId,
        revisionId,
        kind: ReadingActivityKind.LOOKUP,
        position: input.startOffset,
      }),
  });
  const content = stringValue(revision.content, '');
  const title = stringValue(revision.title, '阅读');

  useEffect(() => {
    if (!revisionId || selectedTargetRevisionRef.current === revisionId) return;
    selectedTargetRevisionRef.current = revisionId;
    selectTargets();
  }, [revisionId, selectTargets]);

  useEffect(() => {
    if (!revisionId) return;
    recordActivity({
      documentId,
      revisionId,
      kind: ReadingActivityKind.OPEN,
    });
  }, [documentId, recordActivity, revisionId]);

  useEffect(() => {
    if (!revisionId || !content) return;
    const reportProgress = () => {
      const article = articleRef.current;
      if (!article) return;
      const rect = article.getBoundingClientRect();
      const readableDistance = Math.max(
        1,
        article.offsetHeight - window.innerHeight * 0.35,
      );
      const consumedDistance = Math.max(
        0,
        -rect.top + window.innerHeight * 0.35,
      );
      const progress = Math.min(1, consumedDistance / readableDistance);
      const offset = Math.min(
        content.length,
        Math.round(content.length * progress),
      );
      const previous = lastProgressRef.current;
      const complete = progress >= 0.98;
      if (
        previous.complete ||
        (!complete && progress - previous.progress < 0.02)
      )
        return;
      lastProgressRef.current = { progress, offset, complete };
      recordActivity({
        documentId,
        revisionId,
        kind: complete
          ? ReadingActivityKind.COMPLETE
          : ReadingActivityKind.PROGRESS,
        progress,
        position: offset,
      });
    };
    const scheduleReport = () => {
      if (progressTimerRef.current !== undefined) return;
      progressTimerRef.current = window.setTimeout(() => {
        progressTimerRef.current = undefined;
        reportProgress();
      }, 1_500);
    };
    window.addEventListener('scroll', scheduleReport, { passive: true });
    window.addEventListener('resize', scheduleReport);
    scheduleReport();
    return () => {
      window.removeEventListener('scroll', scheduleReport);
      window.removeEventListener('resize', scheduleReport);
      if (progressTimerRef.current !== undefined)
        window.clearTimeout(progressTimerRef.current);
      progressTimerRef.current = undefined;
    };
  }, [content, documentId, recordActivity, revisionId]);

  const resolveSelection = useCallback(() => {
    const selection = window.getSelection();
    const article = articleRef.current;
    if (
      !selection ||
      selection.isCollapsed ||
      !article ||
      !article.contains(selection.anchorNode)
    )
      return;
    const input = readingSelectionInput(
      article,
      selection,
      content,
      revisionContentHash,
    );
    if (!input) return;
    setSelectedText(input.text);
    lookup.mutate(input);
  }, [content, lookup, revisionContentHash]);

  const matches = asArray(asRecord(lookup.data).matches).map(asRecord);
  return (
    <div className="page reading-document">
      <PageHeader
        eyebrow={stringValue(asRecord(document.origin).kind, 'Reading')}
        title={title}
        description={`${stringValue(revision.wordCount, '0')} 词 · 选择正文中的单词可查询词典`}
        actions={
          <div className="page-header-actions">
            <Button
              icon={Bookmark}
              tone="secondary"
              disabled={save.isPending || save.isSuccess}
              onClick={() => save.mutate()}
            >
              {save.isSuccess ? '已收藏' : '收藏'}
            </Button>
            {documentId && revisionId ? (
              <AgentContextLink
                capability={CapabilityKey.READING_COMPOSE}
                label={title}
                detail="阅读材料"
                contextRef={{
                  kind: AgentResourceKind.READING_DOCUMENT_REVISION,
                  id: documentId,
                  revisionId,
                }}
              />
            ) : null}
          </div>
        }
      />
      <RemoteState pending={query.isPending} error={query.error}>
        <div className="reading-workspace">
          <article
            ref={articleRef}
            className="prose"
            onMouseUp={resolveSelection}
            onKeyUp={resolveSelection}
          >
            {content}
          </article>
          <aside className="reading-inspector" aria-live="polite">
            <Section>
              <h2>
                <Search aria-hidden="true" size={17} /> 选词查询
              </h2>
              {!selectedText ? (
                <p className="reading-inspector__empty">
                  选择正文中的单词或短语。
                </p>
              ) : null}
              {selectedText ? (
                <strong className="reading-inspector__selection">
                  {selectedText}
                </strong>
              ) : null}
              {lookup.isPending ? (
                <p className="reading-inspector__empty">正在匹配词典...</p>
              ) : null}
              {lookup.isError ? (
                <p className="form-error">{lookup.error.message}</p>
              ) : null}
              {!lookup.isPending && selectedText && matches.length === 0 ? (
                <p className="reading-inspector__empty">
                  当前词典版本中没有精确匹配。
                </p>
              ) : null}
              <div className="reading-match-list">
                {matches.map((match, index) => (
                  <ReadingTargetLink
                    key={stringValue(match.headwordId, String(index))}
                    target={match}
                  />
                ))}
              </div>
            </Section>
            {targets.length > 0 ? (
              <Section>
                <h2>本篇学习目标</h2>
                <div className="reading-annotation-list">
                  {targets.map((target, index) => (
                    <ReadingTargetLink
                      key={stringValue(target.id, String(index))}
                      target={target}
                      label={`#${stringValue(target.rank)} · ${stringValue(target.reason)}`}
                    />
                  ))}
                </div>
              </Section>
            ) : null}
            {annotations.length > 0 ? (
              <Section>
                <h2>文中标注</h2>
                <div className="reading-annotation-list">
                  {annotations.map((annotation, index) => (
                    <ReadingTargetLink
                      key={stringValue(annotation.id, String(index))}
                      target={annotation}
                      label={`${stringValue(annotation.targetKind)} · ${Math.round(Number(annotation.confidence ?? 0) * 100)}%`}
                    />
                  ))}
                </div>
              </Section>
            ) : null}
          </aside>
        </div>
      </RemoteState>
    </div>
  );
}

function readingSelectionInput(
  root: HTMLElement,
  selection: Selection,
  content: string,
  revisionContentHash: string,
): ResolveReadingSelectionInput | null {
  if (selection.rangeCount !== 1 || !revisionContentHash) return null;
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return null;
  }
  const prefix = root.ownerDocument.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  const startOffset = prefix.toString().length;
  const text = range.toString();
  const endOffset = startOffset + text.length;
  if (
    !text.trim() ||
    text.length > 120 ||
    content.slice(startOffset, endOffset) !== text
  ) {
    return null;
  }
  return {
    text,
    revisionContentHash,
    offsetUnit: TextOffsetUnit.UTF16_CODE_UNIT,
    startOffset,
    endOffset,
  };
}

function ReadingTargetLink({
  target,
  label,
}: {
  target: Record<string, unknown>;
  label?: string;
}) {
  const kind = stringValue(target.targetKind, 'HEADWORD');
  const id = stringValue(target.targetId ?? target.headwordId, '');
  const text = stringValue(
    target.displayText ?? target.canonicalText ?? target.normalizedText,
    label ?? '查看词条',
  );
  const route =
    kind === 'ENTRY'
      ? 'entries'
      : kind === 'SENSE'
        ? 'senses'
        : kind === 'HEADWORD'
          ? 'headwords'
          : null;
  if (!id) return null;
  if (!route)
    return (
      <div className="reading-target">
        <strong>{text}</strong>
        <span>{label ?? kind}</span>
      </div>
    );
  return (
    <Link to={`/lexicon/${route}/${id}`}>
      <strong>{text}</strong>
      <span>{label ?? kind}</span>
    </Link>
  );
}
