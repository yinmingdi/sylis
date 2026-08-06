import {
  Button,
  Check,
  DataList,
  Field,
  PageHeader,
  Plus,
  Search,
  TextInput,
  Trash2,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { lexiconQueries } from "../../modules/lexicon";
import { notebookCommands, notebookQueries } from "../../modules/notebooks";
import { RemoteState } from "../page-utils";
import { asArray, asRecord, stringValue } from "../page-values";

const targetPath = (kind: string, id: string, displayText: string) => {
  if (kind === "HEADWORD") return `/lexicon/headwords/${id}`;
  if (kind === "ENTRY") return `/lexicon/entries/${id}`;
  if (kind === "SENSE") return `/lexicon/senses/${id}`;
  return `/lexicon/search?q=${encodeURIComponent(displayText)}`;
};

interface SelectedTarget {
  kind: "HEADWORD" | "COLLOCATION";
  id: string;
  label: string;
  detail: string;
}

export function NotebookDetailPage() {
  const { notebookId = "" } = useParams();
  const notebook = useQuery(notebookQueries.get(notebookId));
  const itemsQuery = useQuery(notebookQueries.items(notebookId));
  const cache = useQueryClient();
  const [searchDraft, setSearchDraft] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<SelectedTarget | null>(
    null,
  );
  const [note, setNote] = useState("");
  const search = useQuery(lexiconQueries.search(searchTerm));
  const add = useMutation({
    mutationFn: () =>
      notebookCommands.add(notebookId, {
        target: { kind: selectedTarget?.kind, id: selectedTarget?.id },
        note: note.trim() || undefined,
      }),
    onSuccess: async () => {
      setSelectedTarget(null);
      setNote("");
      await cache.invalidateQueries({
        queryKey: notebookQueries.items(notebookId).queryKey,
      });
    },
  });
  const remove = useMutation({
    mutationFn: (itemId: string) =>
      notebookCommands.removeItem(notebookId, itemId),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: notebookQueries.items(notebookId).queryKey,
      }),
  });
  const header = asRecord(notebook.data);
  const items = asArray(itemsQuery.data).map(asRecord);
  const headwords = search.data?.headwords ?? [];
  const collocations = search.data?.collocations ?? [];
  return (
    <div className="page">
      <PageHeader
        eyebrow="Notebook"
        title={stringValue(header.title, "生词本")}
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
                      kind: "HEADWORD",
                      id: headword.headwordId,
                      label: headword.displayText,
                      detail: headword.entries
                        .map((entry) => entry.partOfSpeechCode)
                        .join(" · "),
                    })
                  }
                >
                  <span>
                    <strong>{headword.displayText}</strong>
                    <small>
                      {headword.entries
                        .map((entry) => entry.partOfSpeechCode)
                        .join(" · ")}
                    </small>
                  </span>
                  {selected ? <Check aria-hidden="true" /> : null}
                </button>
              );
            })}
            {collocations.map((value, index) => {
              const collocation = asRecord(value);
              const id = stringValue(collocation.id, "");
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
                      kind: "COLLOCATION",
                      id,
                      label: stringValue(collocation.canonicalText),
                      detail: "词组",
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
              add.mutate();
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
      <RemoteState
        pending={itemsQuery.isPending}
        error={itemsQuery.error}
        empty={!itemsQuery.isPending && items.length === 0}
      >
        <DataList
          rows={items.map((item) => {
            const displayText = stringValue(
              item.displayText,
              stringValue(item.targetId),
            );
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
              detail: stringValue(
                item.note,
                stringValue(item.detail, asArray(item.tags).join(" · ")),
              ),
              action: (
                <Button
                  icon={Trash2}
                  aria-label="移除"
                  tone="quiet"
                  onClick={() => remove.mutate(stringValue(item.id))}
                >
                  移除
                </Button>
              ),
            };
          })}
        />
      </RemoteState>
    </div>
  );
}
