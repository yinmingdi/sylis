import {
  ModelCredentialStatus,
  type UserModelCredentialView,
} from '@sylis/api-client/user';
import {
  Button,
  Field,
  KeyRound,
  RefreshCw,
  Select,
  ShieldCheck,
  StatusBadge,
  TextInput,
  Trash2,
} from '@sylis/components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { RemoteState } from '../../../pages/page-utils';
import { agentQueries } from '../../agent/api/queries';
import {
  identityCommands,
  modelCredentialCommands,
  modelCredentialsQuery,
  sessionQuery,
  useCurrentUserId,
} from '../index';

export function ModelCredentials() {
  const userId = useCurrentUserId();
  const cache = useQueryClient();
  const credentials = useQuery(modelCredentialsQuery(userId));
  const capabilities = useQuery(agentQueries.capabilities(userId));
  const routes = useMemo(() => {
    const values = new Map<
      string,
      { id: string; providerKey: string; modelId: string }
    >();
    for (const capability of capabilities.data ?? []) {
      for (const { route } of capability.allowedRoutes) {
        values.set(route.id, route);
      }
    }
    return [...values.values()];
  }, [capabilities.data]);
  const [password, setPassword] = useState('');
  const [reauthenticatedUntil, setReauthenticatedUntil] = useState(0);
  const reauthenticate = useMutation({
    mutationFn: () => identityCommands.reauthenticate(password),
    onSuccess: async ({ validForSeconds }) => {
      setPassword('');
      setReauthenticatedUntil(Date.now() + validForSeconds * 1_000);
      await cache.invalidateQueries({ queryKey: sessionQuery.queryKey });
    },
  });
  const recentlyAuthenticated = reauthenticatedUntil > Date.now();

  const [editingProfileId, setEditingProfileId] = useState<string>();
  const editingProfile = credentials.data?.find(
    ({ id }) => id === editingProfileId,
  );
  const selectableRoutes = editingProfile
    ? routes.filter(
        ({ providerKey }) => providerKey === editingProfile.providerKey,
      )
    : routes;
  const [routeId, setRouteId] = useState('');
  const selectedRoute = selectableRoutes.find(({ id }) => id === routeId);
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    if (!selectableRoutes.some(({ id }) => id === routeId)) {
      setRouteId(selectableRoutes[0]?.id ?? '');
    }
  }, [routeId, selectableRoutes]);

  const save = useMutation({
    mutationFn: () => {
      if (!selectedRoute) throw new Error('没有可用的模型路由');
      const expiry = expiresAt ? new Date(expiresAt).toISOString() : undefined;
      return editingProfile
        ? modelCredentialCommands.rotate(
            editingProfile.id,
            {
              routeReleaseId: selectedRoute.id,
              secret,
              ...(expiry ? { expiresAt: expiry } : {}),
            },
            crypto.randomUUID(),
          )
        : modelCredentialCommands.create(
            {
              providerKey: selectedRoute.providerKey,
              routeReleaseId: selectedRoute.id,
              label: label.trim(),
              secret,
              ...(expiry ? { expiresAt: expiry } : {}),
            },
            crypto.randomUUID(),
          );
    },
    onSuccess: async () => {
      setEditingProfileId(undefined);
      setLabel('');
      setSecret('');
      setExpiresAt('');
      await Promise.all([
        cache.invalidateQueries({
          queryKey: modelCredentialsQuery(userId).queryKey,
        }),
        cache.invalidateQueries({
          queryKey: agentQueries.capabilities(userId).queryKey,
        }),
      ]);
    },
  });
  const revoke = useMutation({
    mutationFn: (profileId: string) =>
      modelCredentialCommands.revoke(profileId),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({
          queryKey: modelCredentialsQuery(userId).queryKey,
        }),
        cache.invalidateQueries({
          queryKey: agentQueries.capabilities(userId).queryKey,
        }),
      ]);
    },
  });

  return (
    <>
      <form
        className="byok-reauthentication"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (password && !reauthenticate.isPending) reauthenticate.mutate();
        }}
      >
        <Field label="账户密码">
          <TextInput
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Button
          icon={ShieldCheck}
          type="submit"
          tone="secondary"
          disabled={!password || reauthenticate.isPending}
        >
          验证身份
        </Button>
        {recentlyAuthenticated ? (
          <StatusBadge tone="positive">身份已验证</StatusBadge>
        ) : null}
      </form>
      <form
        className="byok-editor"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (
            selectedRoute &&
            secret &&
            (editingProfile || label.trim()) &&
            recentlyAuthenticated
          ) {
            save.mutate();
          }
        }}
      >
        <Field label="模型路由">
          <Select
            value={routeId}
            onChange={(event) => setRouteId(event.target.value)}
          >
            {selectableRoutes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.providerKey} · {route.modelId}
              </option>
            ))}
          </Select>
        </Field>
        {editingProfile ? null : (
          <Field label="名称">
            <TextInput
              value={label}
              maxLength={120}
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>
        )}
        <Field label={editingProfile ? '新密钥' : '密钥'}>
          <TextInput
            type="password"
            value={secret}
            autoComplete="off"
            onChange={(event) => setSecret(event.target.value)}
          />
        </Field>
        <Field label="有效期">
          <TextInput
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </Field>
        <div className="byok-editor__actions">
          {editingProfile ? (
            <Button
              tone="quiet"
              onClick={() => {
                setEditingProfileId(undefined);
                setSecret('');
              }}
            >
              取消
            </Button>
          ) : null}
          <Button
            icon={editingProfile ? RefreshCw : KeyRound}
            type="submit"
            disabled={
              save.isPending ||
              !selectedRoute ||
              !secret ||
              (!editingProfile && !label.trim()) ||
              !recentlyAuthenticated
            }
          >
            {editingProfile ? '轮换' : '添加'}
          </Button>
        </div>
      </form>
      {reauthenticate.error || save.error || revoke.error ? (
        <p className="form-error">
          {credentialError(reauthenticate.error ?? save.error ?? revoke.error)}
        </p>
      ) : null}
      <RemoteState
        pending={credentials.isPending || capabilities.isPending}
        error={credentials.error ?? capabilities.error}
        empty={!credentials.isPending && (credentials.data?.length ?? 0) === 0}
      >
        <div className="byok-list">
          {(credentials.data ?? []).map((credential) => (
            <CredentialRow
              key={credential.id}
              credential={credential}
              recentlyAuthenticated={recentlyAuthenticated}
              revoking={revoke.isPending}
              onRotate={() => {
                setEditingProfileId(credential.id);
                setRouteId(
                  routes.find(
                    ({ providerKey }) => providerKey === credential.providerKey,
                  )?.id ?? '',
                );
                setSecret('');
              }}
              onRevoke={() => revoke.mutate(credential.id)}
            />
          ))}
        </div>
      </RemoteState>
    </>
  );
}

function CredentialRow({
  credential,
  recentlyAuthenticated,
  revoking,
  onRotate,
  onRevoke,
}: {
  credential: UserModelCredentialView;
  recentlyAuthenticated: boolean;
  revoking: boolean;
  onRotate: () => void;
  onRevoke: () => void;
}) {
  const current = credential.revisions.find(
    ({ id }) => id === credential.currentRevisionId,
  );
  const revision = current ?? credential.revisions[0];
  return (
    <article className="byok-row">
      <div>
        <strong>{credential.label}</strong>
        <span>{credential.providerKey}</span>
        <StatusBadge tone={credentialTone(credential.status)}>
          {credentialStatusLabel(credential.status)}
        </StatusBadge>
      </div>
      <div>
        <code>{revision?.maskedHint ?? '未验证'}</code>
        <small>
          revision {revision?.revisionNo ?? 0} ·{' '}
          {revision?.validatedAt
            ? new Date(revision.validatedAt).toLocaleString('zh-CN')
            : '等待验证'}
        </small>
      </div>
      <div>
        <Button
          icon={RefreshCw}
          tone="quiet"
          disabled={
            !recentlyAuthenticated ||
            credential.status === ModelCredentialStatus.REVOKED
          }
          onClick={onRotate}
        >
          轮换
        </Button>
        <Button
          icon={Trash2}
          tone="quiet"
          disabled={
            !recentlyAuthenticated ||
            revoking ||
            credential.status === ModelCredentialStatus.REVOKED
          }
          onClick={onRevoke}
        >
          撤销
        </Button>
      </div>
    </article>
  );
}

function credentialTone(
  status: ModelCredentialStatus,
): 'positive' | 'warning' | 'danger' | 'neutral' {
  if (status === ModelCredentialStatus.VERIFIED) return 'positive';
  if (status === ModelCredentialStatus.PENDING) return 'warning';
  if (
    status === ModelCredentialStatus.REVOKED ||
    status === ModelCredentialStatus.QUARANTINED ||
    status === ModelCredentialStatus.EXPIRED
  ) {
    return 'danger';
  }
  return 'neutral';
}

function credentialStatusLabel(status: ModelCredentialStatus): string {
  return {
    [ModelCredentialStatus.PENDING]: '待验证',
    [ModelCredentialStatus.VERIFIED]: '可用',
    [ModelCredentialStatus.RETIRED]: '已归档',
    [ModelCredentialStatus.QUARANTINED]: '已隔离',
    [ModelCredentialStatus.EXPIRED]: '已过期',
    [ModelCredentialStatus.REVOKED]: '已撤销',
  }[status];
}

function credentialError(error: unknown): string {
  const message = error instanceof Error ? error.message : '凭证操作失败';
  if (message.includes('RECENT_REAUTHENTICATION_REQUIRED')) {
    return '请先验证账户密码';
  }
  if (message.includes('BYOK_VALIDATION_FAILED')) {
    const code = message.split(':').at(-1);
    return '密钥验证失败' + (code ? ' · ' + code : '');
  }
  if (message.includes('BYOK_VALIDATION_ROUTE_INVALID')) {
    return '该密钥与所选模型路由不匹配';
  }
  return message;
}
