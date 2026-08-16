import {
  agentMessagePlainText,
  DiagnosticBundleRevisionStatus,
  DiagnosticReferenceKind,
  type AgentDiagnosticReference,
} from '@sylis/api-client/agent';
import {
  SupportGrantPurpose,
  SupportResourceKind,
  type SupportGrantPreview,
} from '@sylis/api-client/user';
import {
  Button,
  Check,
  Field,
  FileText,
  Save,
  Select,
  ShieldCheck,
  StatusBadge,
  TextInput,
  Trash2,
} from '@sylis/components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { RemoteState } from '../../../pages/page-utils';
import {
  identityCommands,
  sessionQuery,
  supportGrantCommands,
  supportGrantsQuery,
  useCurrentUserId,
} from '../../identity';
import { agentCommands } from '../api/commands';
import { agentQueries } from '../api/queries';

interface SelectableDiagnosticReference {
  key: string;
  ref: AgentDiagnosticReference;
  label: string;
  detail: string;
}

export function DiagnosticSupport() {
  const userId = useCurrentUserId();
  const cache = useQueryClient();
  const sessions = useQuery(agentQueries.sessions(userId));
  const artifacts = useQuery(agentQueries.artifacts(userId));
  const assets = useQuery(agentQueries.assets(userId));
  const bundles = useQuery(agentQueries.diagnostics(userId));
  const [sessionId, setSessionId] = useState('');
  const messages = useQuery(agentQueries.messages(userId, sessionId));
  const runs = useQuery(agentQueries.runs(userId, sessionId));

  useEffect(() => {
    if (!sessionId && sessions.data?.[0]) setSessionId(sessions.data[0].id);
  }, [sessionId, sessions.data]);

  const references = useMemo<readonly SelectableDiagnosticReference[]>(
    () => [
      ...(messages.data ?? []).slice(-20).map((message) => ({
        key: DiagnosticReferenceKind.AGENT_MESSAGE + ':' + message.id,
        ref: {
          kind: DiagnosticReferenceKind.AGENT_MESSAGE,
          id: message.id,
        },
        label: '消息 ' + message.sequence,
        detail: agentMessagePlainText(message).slice(0, 100),
      })),
      ...(runs.data ?? []).slice(0, 20).map((run) => ({
        key: DiagnosticReferenceKind.AGENT_RUN + ':' + run.id,
        ref: { kind: DiagnosticReferenceKind.AGENT_RUN, id: run.id },
        label: 'Run ' + run.id.slice(0, 8),
        detail: run.status + ' · ' + run.requestedCapability,
      })),
      ...(artifacts.data ?? []).flatMap((artifact) =>
        artifact.currentRevisionId
          ? [
              {
                key:
                  DiagnosticReferenceKind.AGENT_ARTIFACT_REVISION +
                  ':' +
                  artifact.currentRevisionId,
                ref: {
                  kind: DiagnosticReferenceKind.AGENT_ARTIFACT_REVISION,
                  id: artifact.currentRevisionId,
                },
                label: artifact.title,
                detail: 'Artifact · ' + artifact.kind,
              },
            ]
          : [],
      ),
      ...(assets.data ?? []).flatMap((asset) =>
        asset.currentRevisionId
          ? [
              {
                key:
                  DiagnosticReferenceKind.CONTENT_ASSET_REVISION +
                  ':' +
                  asset.currentRevisionId,
                ref: {
                  kind: DiagnosticReferenceKind.CONTENT_ASSET_REVISION,
                  id: asset.currentRevisionId,
                },
                label:
                  asset.revisions.find(
                    ({ id }) => id === asset.currentRevisionId,
                  )?.filename ?? '文件',
                detail: 'Asset · ' + asset.status,
              },
            ]
          : [],
      ),
    ],
    [artifacts.data, assets.data, messages.data, runs.data],
  );
  const [selectedRefs, setSelectedRefs] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const selectedReferences = references
    .filter(({ key }) => selectedRefs.has(key))
    .map(({ ref }) => ref);
  const [bundleId, setBundleId] = useState('');
  const bundle = useQuery(agentQueries.diagnostic(userId, bundleId));
  const createDraft = useMutation({
    mutationFn: () =>
      agentCommands.diagnostics.create(selectedReferences, crypto.randomUUID()),
    onSuccess: async (created) => {
      setBundleId(created.id);
      await cache.invalidateQueries({
        queryKey: agentQueries.diagnostics(userId).queryKey,
      });
    },
  });
  const revision = bundle.data?.revisions?.find(
    ({ id }) => id === bundle.data?.currentRevisionId,
  );
  const [editorRevisionId, setEditorRevisionId] = useState('');
  const [payload, setPayload] = useState('');
  useEffect(() => {
    if (revision && revision.id !== editorRevisionId) {
      setEditorRevisionId(revision.id);
      setPayload(JSON.stringify(revision.redactedPayload, null, 2));
    }
  }, [editorRevisionId, revision]);
  const revise = useMutation({
    mutationFn: () =>
      agentCommands.diagnostics.revise(bundleId, {
        redactedPayload: JSON.parse(payload) as unknown,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: async (updated) => {
      setEditorRevisionId(updated.id);
      setPayload(JSON.stringify(updated.redactedPayload, null, 2));
      await cache.invalidateQueries({
        queryKey: agentQueries.diagnostic(userId, bundleId).queryKey,
      });
    },
  });
  const confirm = useMutation({
    mutationFn: () => agentCommands.diagnostics.confirm(bundleId, revision!.id),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({
          queryKey: agentQueries.diagnostic(userId, bundleId).queryKey,
        }),
        cache.invalidateQueries({
          queryKey: agentQueries.diagnostics(userId).queryKey,
        }),
      ]);
    },
  });
  const confirmedRevision =
    bundle.data?.revisions?.find(
      ({ status }) => status === DiagnosticBundleRevisionStatus.CONFIRMED,
    ) ?? null;

  return (
    <div className="diagnostic-support">
      <div className="diagnostic-source-picker">
        <Field label="会话">
          <Select
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
          >
            {(sessions.data ?? []).map((session) => (
              <option key={session.id} value={session.id}>
                {session.title}
              </option>
            ))}
          </Select>
        </Field>
        <div className="diagnostic-reference-list">
          {references.map((item) => (
            <label key={item.key}>
              <input
                type="checkbox"
                checked={selectedRefs.has(item.key)}
                onChange={(event) => {
                  setSelectedRefs((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(item.key);
                    else next.delete(item.key);
                    return next;
                  });
                }}
              />
              <span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
            </label>
          ))}
        </div>
        <Button
          icon={FileText}
          disabled={selectedReferences.length === 0 || createDraft.isPending}
          onClick={() => createDraft.mutate()}
        >
          创建诊断包
        </Button>
      </div>
      <RemoteState
        pending={bundles.isPending}
        error={bundles.error}
        empty={!bundles.isPending && (bundles.data?.length ?? 0) === 0}
      >
        <div className="diagnostic-bundle-list">
          {(bundles.data ?? []).map((item) => (
            <Button
              key={item.id}
              tone={item.id === bundleId ? 'secondary' : 'quiet'}
              onClick={() => setBundleId(item.id)}
            >
              Bundle {item.id.slice(0, 8)}
            </Button>
          ))}
        </div>
      </RemoteState>
      {revision ? (
        <div className="diagnostic-editor">
          <header>
            <div>
              <strong>Revision {revision.revisionNo}</strong>
              <code>{revision.contentHash}</code>
            </div>
            <StatusBadge
              tone={
                revision.status === DiagnosticBundleRevisionStatus.CONFIRMED
                  ? 'positive'
                  : 'warning'
              }
            >
              {revision.status === DiagnosticBundleRevisionStatus.CONFIRMED
                ? '已确认'
                : '草稿'}
            </StatusBadge>
          </header>
          <textarea
            aria-label="诊断包 JSON"
            value={payload}
            spellCheck={false}
            readOnly={
              revision.status === DiagnosticBundleRevisionStatus.CONFIRMED
            }
            onChange={(event) => setPayload(event.target.value)}
          />
          {revision.status === DiagnosticBundleRevisionStatus.DRAFT ? (
            <div>
              <Button
                icon={Save}
                tone="secondary"
                disabled={!payload || revise.isPending}
                onClick={() => revise.mutate()}
              >
                保存修订
              </Button>
              <Button
                icon={Check}
                disabled={confirm.isPending}
                onClick={() => confirm.mutate()}
              >
                确认内容
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {createDraft.error || revise.error || confirm.error ? (
        <p className="form-error">
          {(createDraft.error ?? revise.error ?? confirm.error)?.message}
        </p>
      ) : null}
      <SupportGrantManagement
        bundleId={bundleId}
        revisionId={confirmedRevision?.id ?? ''}
      />
    </div>
  );
}

function SupportGrantManagement({
  bundleId,
  revisionId,
}: {
  bundleId: string;
  revisionId: string;
}) {
  const userId = useCurrentUserId();
  const cache = useQueryClient();
  const grants = useQuery(supportGrantsQuery(userId));
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
  const recent = reauthenticatedUntil > Date.now();
  const [supportUserId, setSupportUserId] = useState('');
  const [purpose, setPurpose] = useState(
    SupportGrantPurpose.TECHNICAL_DIAGNOSIS,
  );
  const [purposeDetails, setPurposeDetails] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(7_200);
  const [preview, setPreview] = useState<SupportGrantPreview>();
  const previewGrant = useMutation({
    mutationFn: () =>
      supportGrantCommands.preview({
        supportUserId,
        resourceKind: SupportResourceKind.DIAGNOSTIC_BUNDLE_REVISION,
        resourceId: bundleId,
        resourceRevisionId: revisionId,
        purpose,
        purposeDetails: purposeDetails.trim(),
        durationSeconds,
      }),
    onSuccess: setPreview,
  });
  const createGrant = useMutation({
    mutationFn: () =>
      supportGrantCommands.create(preview!, crypto.randomUUID()),
    onSuccess: async () => {
      setPreview(undefined);
      await cache.invalidateQueries({
        queryKey: supportGrantsQuery(userId).queryKey,
      });
    },
  });
  const revoke = useMutation({
    mutationFn: (grantId: string) => supportGrantCommands.revoke(grantId),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: supportGrantsQuery(userId).queryKey,
      }),
  });
  return (
    <div className="support-grant-management">
      <h3>支持授权</h3>
      <form
        className="support-grant-reauth"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (password) reauthenticate.mutate();
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
      </form>
      <div className="support-grant-editor">
        <Field label="Support 用户 ID">
          <TextInput
            value={supportUserId}
            onChange={(event) => setSupportUserId(event.target.value)}
          />
        </Field>
        <Field label="用途">
          <Select
            value={purpose}
            onChange={(event) =>
              setPurpose(event.target.value as SupportGrantPurpose)
            }
          >
            <option value={SupportGrantPurpose.TECHNICAL_DIAGNOSIS}>
              技术排障
            </option>
            <option value={SupportGrantPurpose.CONTENT_CORRECTION}>
              内容修正
            </option>
            <option value={SupportGrantPurpose.DATA_EXPORT_ASSISTANCE}>
              数据导出协助
            </option>
          </Select>
        </Field>
        <Field label="有效时间">
          <Select
            value={durationSeconds}
            onChange={(event) => setDurationSeconds(Number(event.target.value))}
          >
            <option value={3_600}>1 小时</option>
            <option value={7_200}>2 小时</option>
            <option value={28_800}>8 小时</option>
            <option value={86_400}>24 小时</option>
          </Select>
        </Field>
        <Field label="用途说明">
          <TextInput
            value={purposeDetails}
            onChange={(event) => setPurposeDetails(event.target.value)}
          />
        </Field>
        <Button
          tone="secondary"
          disabled={
            !recent ||
            !revisionId ||
            !supportUserId ||
            !purposeDetails.trim() ||
            previewGrant.isPending
          }
          onClick={() => previewGrant.mutate()}
        >
          预览授权
        </Button>
      </div>
      {preview ? (
        <div className="support-grant-preview">
          <code>{preview.actionDigest}</code>
          <span>{new Date(preview.expiresAt).toLocaleString('zh-CN')}</span>
          <Button
            icon={Check}
            disabled={createGrant.isPending}
            onClick={() => createGrant.mutate()}
          >
            确认授权
          </Button>
        </div>
      ) : null}
      <div className="support-grant-list">
        {(grants.data ?? []).map((grant) => (
          <div key={grant.id}>
            <div>
              <strong>{grant.purposeDetails}</strong>
              <small>
                {grant.supportUserId} ·{' '}
                {new Date(grant.expiresAt).toLocaleString('zh-CN')}
              </small>
            </div>
            <StatusBadge
              tone={
                grant.revokedAt || new Date(grant.expiresAt) <= new Date()
                  ? 'neutral'
                  : 'positive'
              }
            >
              {grant.revokedAt ? '已撤销' : '有效'}
            </StatusBadge>
            <Button
              icon={Trash2}
              tone="quiet"
              disabled={!recent || Boolean(grant.revokedAt) || revoke.isPending}
              onClick={() => revoke.mutate(grant.id)}
            >
              撤销
            </Button>
          </div>
        ))}
      </div>
      {reauthenticate.error ||
      previewGrant.error ||
      createGrant.error ||
      revoke.error ? (
        <p className="form-error">
          {
            (
              reauthenticate.error ??
              previewGrant.error ??
              createGrant.error ??
              revoke.error
            )?.message
          }
        </p>
      ) : null}
    </div>
  );
}
