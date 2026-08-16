import { AgentResourceKind, CapabilityKey } from '@sylis/api-client/agent';
import { LexicalTargetKind } from '@sylis/api-client/user';
import {
  Button,
  Check,
  DataList,
  Field,
  PageHeader,
  Plus,
  Save,
  Search,
  SquarePen,
  TextInput,
  Trash2,
} from '@sylis/components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AgentContextLink } from '../../modules/agent';
import { useCurrentUserId } from '../../modules/identity';
import { lexiconQueries } from '../../modules/lexicon';
import { notebookCommands, notebookQueries } from '../../modules/notebooks';
import { RemoteState } from '../page-utils';
import { asArray, asRecord, stringValue } from '../page-values';

const targetPath = (kind: string, id: string, displayText: string) => {
  if (kind === LexicalTargetKind.HEADWORD) return `/lexicon/headwords/${id}`;
  if (kind === LexicalTargetKind.ENTRY) return `/lexicon/entries/${id}`;
  if (kind === LexicalTargetKind.SENSE) return `/lexicon/senses/${id}`;
  return `/lexicon/search?q=${encodeURIComponent(displayText)}`;
};

interface SelectedTarget {
  kind: LexicalTargetKind.HEADWORD | LexicalTargetKind.COLLOCATION;
  id: string;
  label: string;
  detail: string;
}

export function NotebookDetailPage() {
  const userId = useCurrentUserId();
  const { notebookId = '' } = useParams();
  const notebook = useQuery(notebookQueries.get(userId, notebookId));
  const itemsQuery = useQuery(notebookQueries.items(userId, notebookId));
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<SelectedTarget | null>(
    null,
  );
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('');
  const [editingItemId, setEditingItemId] = useState<string>();
  const [editingNote, setEditingNote] = useState('');
  const [editingTags, setEditingTags] = useState('');
  const search = useQuery(lexiconQueries.search(searchTerm));
  const add = useMutation({
    mutationFn: (target: SelectedTarget) =>
      notebookCommands.add(notebookId, {
        target: { kind: target.kind, id: target.id },
        note: note.trim() || undefined,
      }),
    onSuccess: async () => {
      setSelectedTarget(null);
      setNote('');
      await cache.invalidateQueries({
        queryKey: notebookQueries.items(userId, notebookId).queryKey,
      });
    },
  });
  const remove = useMutation({
    mutationFn: (itemId: string) =>
      notebookCommands.removeItem(notebookId, itemId),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: notebookQueries.items(userId, notebookId).queryKey,
      }),
  });
  const update = useMutation({
    mutationFn: () => {
      if (!editingItemId) throw new Error('NOTEBOOK_ITEM_REQUIRED');
      return notebookCommands.updateItem(notebookId, editingItemId, {
        note: editingNote.trim() || undefined,
        tags: editingTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
    },
    onSuccess: async () => {
      setEditingItemId(undefined);
      setEditingNote('');
      setEditingTags('');
      await cache.invalidateQueries({
        queryKey: notebookQueries.items(userId, notebookId).queryKey,
      });
    },
  });
  const removeNotebook = useMutation({
    mutationFn: () => notebookCommands.remove(notebookId),
    onSuccess: async () => {
      await cache.invalidateQueries({
        queryKey: notebookQueries.list(userId).queryKey,
      });
      navigate('/notebooks', { replace: true });
    },
  });
  const header = asRecord(notebook.data);
  const title = stringValue(header.name, '生词本');
  const items = asArray(itemsQuery.data).map(asRecord);
  const normalizedFilter = filter.trim().toLocaleLowerCase('en-US');
  const visibleItems = normalizedFilter
    ? items.filter((item) =>
        [
          stringValue(item.displayText),
          stringValue(item.note),
          ...asArray(item.tags).map(String),
        ]
          .join(' ')
          .toLocaleLowerCase('en-US')
          .includes(normalizedFilter),
      )
    : items;
  const editingItem = items.find(
    (item) => stringValue(item.id) === editingItemId,
  );
  const headwords = search.data?.data.headwords ?? [];
  const collocations = search.data?.data.collocations ?? [];
  return (
    <div className="page">
      <PageHeader
        eyebrow="Notebook"
        title={title}
        actions={
          notebookId ? (
            <div className="page-header-actions">
              <AgentContextLink
                capability={CapabilityKey.STUDY_COACH}
                label={title}
                detail="Notebook"
                contextRef={{
                  kind: AgentResourceKind.NOTEBOOK,
                  id: notebookId,
                }}
              />
              <Button
                icon={Trash2}
                tone="danger"
                disabled={removeNotebook.isPending}
                onClick={() => {
                  if (globalThis.confirm(`删除生词本“${title}”？`)) {
                    removeNotebook.mutate();
                  }
                }}
              >
                删除生词本
              </Button>
            </div>
          ) : null
        }
      />
      <section className="notebook-picker">
        <form
          className="search-box"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            setSelectedTarget(null);
            setSearchTerm(searchDraft.trim());
          }}
        >
          <Search aria-hidden="true" />
          <TextInput
            aria-label="搜索要加入的单词或词组"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="搜索单词或词组"
          />
        </form>
        {search.isPending && searchTerm ? (
          <div className="skeleton-lines">
            <span />
            <span />
          </div>
        ) : null}
        {search.isError ? (
          <p className="form-error">{search.error.message}</p>
        ) : null}
        {headwords.length > 0 || collocations.length > 0 ? (
          <div
            className="notebook-search-results"
            role="listbox"
            aria-label="词典匹配结果"
          >
            {headwords.map((headword) => {
              const selected = selectedTarget?.id === headword.headwordId;
              return (
                <button
                  key={headword.headwordId}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() =>
                    setSelectedTarget({
                      kind: LexicalTargetKind.HEADWORD,
                      id: headword.headwordId,
                      label: headword.displayText,
                      detail: headword.entries
                        .map((entry) => entry.partOfSpeechCode)
                        .join(' · '),
                    })
                  }
                >
                  <span>
                    <strong>{headword.displayText}</strong>
                    <small>
                      {headword.entries
                        .map((entry) => entry.partOfSpeechCode)
                        .join(' · ')}
                    </small>
                  </span>
                  {selected ? <Check aria-hidden="true" /> : null}
                </button>
              );
            })}
            {collocations.map((value, index) => {
              const collocation = asRecord(value);
              const id = stringValue(collocation.id, '');
              const selected = selectedTarget?.id === id;
              return (
                <button
                  key={id || String(index)}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={!id}
                  onClick={() =>
                    setSelectedTarget({
                      kind: LexicalTargetKind.COLLOCATION,
                      id,
                      label: stringValue(collocation.canonicalText),
                      detail: '词组',
                    })
                  }
                >
                  <span>
                    <strong>{stringValue(collocation.canonicalText)}</strong>
                    <small>词组</small>
                  </span>
                  {selected ? <Check aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {selectedTarget ? (
          <form
            className="notebook-command"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              add.mutate(selectedTarget);
            }}
          >
            <div className="notebook-selected-target">
              <span>已选择</span>
              <strong>{selectedTarget.label}</strong>
              <small>{selectedTarget.detail}</small>
            </div>
            <Field label="笔记">
              <TextInput
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={2000}
              />
            </Field>
            <Button icon={Plus} type="submit" disabled={add.isPending}>
              加入
            </Button>
          </form>
        ) : null}
        {add.error ? <p className="form-error">{add.error.message}</p> : null}
      </section>
      <section className="notebook-filter">
        <Field label="筛选条目">
          <TextInput
            aria-label="筛选生词本条目"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="按单词、笔记或标签筛选"
          />
        </Field>
      </section>
      {editingItem ? (
        <form
          className="notebook-command"
          aria-label={`编辑 ${stringValue(editingItem.displayText)}`}
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            update.mutate();
          }}
        >
          <strong>{stringValue(editingItem.displayText)}</strong>
          <Field label="编辑笔记">
            <TextInput
              value={editingNote}
              maxLength={2000}
              onChange={(event) => setEditingNote(event.target.value)}
            />
          </Field>
          <Field label="标签">
            <TextInput
              value={editingTags}
              onChange={(event) => setEditingTags(event.target.value)}
              placeholder="逗号分隔"
            />
          </Field>
          <Button tone="quiet" onClick={() => setEditingItemId(undefined)}>
            取消
          </Button>
          <Button icon={Save} type="submit" disabled={update.isPending}>
            保存修改
          </Button>
        </form>
      ) : null}
      <RemoteState
        pending={itemsQuery.isPending}
        error={itemsQuery.error}
        empty={!itemsQuery.isPending && items.length === 0}
      >
        <DataList
          rows={visibleItems.map((item) => {
            const displayText = stringValue(
              item.displayText,
              stringValue(item.targetId),
            );
            const tags = asArray(item.tags).map(String);
            const detail = [
              stringValue(item.note),
              ...tags.map((tag) => `#${tag}`),
            ]
              .filter(Boolean)
              .join(' · ');
            return {
              label: stringValue(item.targetKind),
              value: (
                <Link
                  to={targetPath(
                    stringValue(item.targetKind),
                    stringValue(item.targetId),
                    displayText,
                  )}
                >
                  {displayText}
                </Link>
              ),
              detail: detail || stringValue(item.detail),
              action: (
                <div className="notebook-item-actions">
                  <Button
                    icon={SquarePen}
                    aria-label={`编辑 ${displayText}`}
                    tone="quiet"
                    onClick={() => {
                      setEditingItemId(stringValue(item.id));
                      setEditingNote(stringValue(item.note));
                      setEditingTags(tags.join(', '));
                    }}
                  >
                    编辑
                  </Button>
                  <Button
                    icon={Trash2}
                    aria-label={`移除 ${displayText}`}
                    tone="quiet"
                    onClick={() => remove.mutate(stringValue(item.id))}
                  >
                    移除
                  </Button>
                </div>
              ),
            };
          })}
        />
      </RemoteState>
      {normalizedFilter && visibleItems.length === 0 ? (
        <p role="status">没有匹配的条目</p>
      ) : null}
    </div>
  );
}
