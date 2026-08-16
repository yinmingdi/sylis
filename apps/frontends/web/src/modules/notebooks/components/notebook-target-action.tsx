import { LexicalTargetKind } from '@sylis/api-client/user';
import { BookmarkPlus, Button, Select } from '@sylis/components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { asArray, asRecord, stringValue } from '../../../pages/page-values';
import { useCurrentUserId } from '../../identity';
import { notebookCommands, notebookQueries } from '../api';

export function NotebookTargetAction({
  kind,
  id,
}: {
  kind: LexicalTargetKind;
  id: string;
}) {
  const userId = useCurrentUserId();
  const query = useQuery(notebookQueries.list(userId));
  const cache = useQueryClient();
  const navigate = useNavigate();
  const notebooks = asArray(query.data).map(asRecord);
  const [notebookId, setNotebookId] = useState('');
  useEffect(() => {
    if (!notebookId && notebooks[0])
      setNotebookId(stringValue(notebooks[0].id));
  }, [notebookId, notebooks]);
  const add = useMutation({
    mutationFn: () =>
      notebookCommands.add(notebookId, { target: { kind, id } }),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: notebookQueries.items(userId, notebookId).queryKey,
      }),
  });

  if (!query.isPending && notebooks.length === 0) {
    return (
      <Button
        icon={BookmarkPlus}
        tone="secondary"
        onClick={() => navigate('/notebooks')}
      >
        新建生词本
      </Button>
    );
  }
  return (
    <div className="notebook-target-action">
      <Select
        aria-label="选择生词本"
        value={notebookId}
        onChange={(event) => setNotebookId(event.target.value)}
        disabled={query.isPending}
      >
        {notebooks.map((notebook) => (
          <option
            key={stringValue(notebook.id)}
            value={stringValue(notebook.id)}
          >
            {stringValue(notebook.name)}
          </option>
        ))}
      </Select>
      <Button
        icon={BookmarkPlus}
        tone="secondary"
        onClick={() => add.mutate()}
        disabled={!notebookId || add.isPending}
      >
        {add.isSuccess ? '已收藏' : '收藏'}
      </Button>
    </div>
  );
}
