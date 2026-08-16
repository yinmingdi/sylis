import {
  Button,
  Download,
  Field,
  PageHeader,
  Section,
  TextInput,
  Trash2,
} from '@sylis/components';
import { DataExportCategory } from '@sylis/job-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  dataCommands,
  identityCommands,
  resetAuthenticatedClientState,
  useCurrentUserId,
  userQueryKey,
} from '../../modules/identity';
import { JobProgress } from '../../modules/jobs';
import { asRecord, stringValue } from '../page-values';

export function DataPage() {
  const userId = useCurrentUserId();
  const cache = useQueryClient();
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [password, setPassword] = useState('');
  const request = useMutation({
    mutationFn: () =>
      dataCommands.requestExport(
        Object.values(DataExportCategory),
        crypto.randomUUID(),
      ),
  });
  const requestId = request.data?.requestId ?? '';
  const exportQuery = useQuery({
    queryKey: userQueryKey(userId, 'identity', 'data-export', requestId),
    queryFn: () => dataCommands.exportStatus(requestId),
    enabled: Boolean(requestId),
    refetchInterval: (query) =>
      asRecord(query.state.data).artifactUrl ? false : 5_000,
  });
  const exported = asRecord(exportQuery.data);
  const artifactUrl = stringValue(exported.artifactUrl, '');
  const deletion = useMutation({
    mutationFn: async () => {
      await identityCommands.reauthenticate(password);
      return identityCommands.requestAccountDeletion(crypto.randomUUID());
    },
    onSuccess: async () => {
      await resetAuthenticatedClientState(cache);
      window.location.assign('/login');
    },
  });
  return (
    <div className="page">
      <PageHeader
        eyebrow="Data"
        title="我的数据"
        actions={
          <Button
            icon={Download}
            disabled={request.isPending}
            onClick={() => request.mutate()}
          >
            创建导出
          </Button>
        }
      />
      {request.data ? (
        <JobProgress
          jobId={request.data.jobId}
          onTerminal={() => void exportQuery.refetch()}
        />
      ) : null}
      {artifactUrl ? (
        <div className="settings-actions">
          <Button
            icon={Download}
            onClick={() => window.location.assign(artifactUrl)}
          >
            下载 JSON
          </Button>
          <span>
            下载链接将在{' '}
            {new Date(stringValue(exported.expiresAt)).toLocaleString()} 失效
          </span>
        </div>
      ) : null}
      {request.error ? (
        <p className="form-error">{request.error.message}</p>
      ) : null}
      {exportQuery.error ? (
        <p className="form-error">{exportQuery.error.message}</p>
      ) : null}
      <Section className="danger-zone">
        <h2>删除账号</h2>
        {!deletionOpen ? (
          <Button
            icon={Trash2}
            tone="danger"
            onClick={() => setDeletionOpen(true)}
          >
            删除账号和数据
          </Button>
        ) : (
          <div className="settings-form">
            <Field label="当前密码">
              <TextInput
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={deletion.isPending}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <div className="settings-actions">
              <Button
                icon={Trash2}
                tone="danger"
                disabled={!password || deletion.isPending}
                onClick={() => deletion.mutate()}
              >
                {deletion.isPending ? '正在提交' : '确认删除'}
              </Button>
              <Button
                tone="secondary"
                disabled={deletion.isPending}
                onClick={() => {
                  setDeletionOpen(false);
                  setPassword('');
                }}
              >
                取消
              </Button>
            </div>
          </div>
        )}
        {deletion.error ? (
          <p className="form-error">{deletion.error.message}</p>
        ) : null}
      </Section>
    </div>
  );
}
