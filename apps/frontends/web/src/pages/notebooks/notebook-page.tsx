import {
  Button,
  Field,
  NotebookPen,
  PageHeader,
  Plus,
  TextInput,
} from '@sylis/components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { useCurrentUserId } from '../../modules/identity';
import { notebookCommands, notebookQueries } from '../../modules/notebooks';
import { RemoteState } from '../page-utils';
import { asArray, asRecord, stringValue } from '../page-values';

export function NotebookPage() {
  const userId = useCurrentUserId();
  const query = useQuery(notebookQueries.list(userId));
  const cache = useQueryClient();
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => notebookCommands.create({ name }),
    onSuccess: async () => {
      setName('');
      await cache.invalidateQueries({
        queryKey: notebookQueries.list(userId).queryKey,
      });
    },
  });
  const notebooks = asArray(query.data).map(asRecord);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Notebook"
        title="生词本"
        actions={
          <form
            className="inline-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <Field label="新建生词本">
              <TextInput
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="名称"
              />
            </Field>
            <Button icon={Plus} type="submit" disabled={!name.trim()}>
              新建
            </Button>
          </form>
        }
      />
      <RemoteState
        pending={query.isPending}
        error={query.error}
        empty={!query.isPending && notebooks.length === 0}
      >
        <div className="book-grid">
          {notebooks.map((notebook) => (
            <article key={stringValue(notebook.id)}>
              <NotebookPen />
              <span>
                {stringValue(
                  notebook._count ? asRecord(notebook._count).items : '0',
                )}{' '}
                项
              </span>
              <h2>{stringValue(notebook.name)}</h2>
              <p>{stringValue(notebook.description, '')}</p>
              <Link to={`/notebooks/${stringValue(notebook.id)}`}>打开</Link>
            </article>
          ))}
        </div>
      </RemoteState>
    </div>
  );
}
