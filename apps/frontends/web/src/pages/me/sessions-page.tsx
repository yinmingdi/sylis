import { Button, DataList, PageHeader, Trash2 } from '@sylis/components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  identityCommands,
  sessionsQuery,
  useCurrentUserId,
} from '../../modules/identity';
import { RemoteState } from '../page-utils';
import { asArray, asRecord, stringValue } from '../page-values';

export function SessionsPage() {
  const userId = useCurrentUserId();
  const queryOptions = sessionsQuery(userId);
  const query = useQuery(queryOptions);
  const cache = useQueryClient();
  const revoke = useMutation({
    mutationFn: identityCommands.revokeSession,
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: queryOptions.queryKey }),
  });
  const sessions = asArray(query.data).map(asRecord);
  return (
    <div className="page">
      <PageHeader eyebrow="Security" title="登录设备" />
      <RemoteState pending={query.isPending} error={query.error}>
        <DataList
          rows={sessions.map((session) => ({
            label: stringValue(session.authStrength, 'Session'),
            value: stringValue(session.lastSeenAt ?? session.createdAt),
            detail: stringValue(session.deviceLabel, ''),
            action: (
              <Button
                icon={Trash2}
                tone="quiet"
                onClick={() => revoke.mutate(stringValue(session.id))}
              >
                撤销
              </Button>
            ),
          }))}
        />
      </RemoteState>
    </div>
  );
}
