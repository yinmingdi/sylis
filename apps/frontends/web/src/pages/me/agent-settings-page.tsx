import { AgentResourceKind } from '@sylis/api-client/agent';
import {
  Button,
  Check,
  PageHeader,
  Save,
  Section,
  Trash2,
} from '@sylis/components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import {
  AgentContextLink,
  DiagnosticSupport,
  agentCommands,
  agentQueries,
} from '../../modules/agent';
import { useCurrentUserId } from '../../modules/identity';
import { ModelCredentials } from '../../modules/identity/components/model-credentials';
import { RemoteState } from '../page-utils';

export function AgentSettingsPage() {
  const userId = useCurrentUserId();
  const memory = useQuery(agentQueries.memory(userId));
  const usage = useQuery(agentQueries.usage(userId));
  const cache = useQueryClient();
  const [editingId, setEditingId] = useState<string>();
  const [subject, setSubject] = useState('');
  const [claim, setClaim] = useState('');
  const [confidence, setConfidence] = useState(0.5);
  const update = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('没有正在编辑的记忆');
      return agentCommands.memory.update(editingId, {
        subject: subject.trim(),
        claim: claim.trim(),
        confidence,
        idempotencyKey: crypto.randomUUID(),
      });
    },
    onSuccess: async () => {
      setEditingId(undefined);
      await cache.invalidateQueries({
        queryKey: agentQueries.memory(userId).queryKey,
      });
    },
  });
  const suppress = useMutation({
    mutationFn: (id: string) =>
      agentCommands.memory.suppress(id, 'USER_SUPPRESSED'),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: agentQueries.memory(userId).queryKey,
      }),
  });
  return (
    <div className="page agent-settings-page">
      <PageHeader eyebrow="Agent" title="记忆与用量" />
      <Section>
        <h2>模型凭证</h2>
        <ModelCredentials />
      </Section>
      <Section>
        <h2>诊断与支持</h2>
        <DiagnosticSupport />
      </Section>
      <Section>
        <h2>长期记忆</h2>
        <RemoteState
          pending={memory.isPending}
          error={memory.error}
          empty={!memory.isPending && (memory.data?.length ?? 0) === 0}
        >
          <div className="agent-memory-list">
            {(memory.data ?? []).map((card) =>
              editingId === card.id ? (
                <form
                  key={card.id}
                  className="agent-memory-editor"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    if (subject.trim() && claim.trim()) update.mutate();
                  }}
                >
                  <input
                    className="sy-input"
                    aria-label="记忆主题"
                    value={subject}
                    maxLength={240}
                    onChange={(event) => setSubject(event.target.value)}
                  />
                  <textarea
                    className="sy-input"
                    aria-label="记忆内容"
                    value={claim}
                    maxLength={20_000}
                    onChange={(event) => setClaim(event.target.value)}
                  />
                  <label>
                    置信度
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={confidence}
                      onChange={(event) =>
                        setConfidence(Number(event.target.value))
                      }
                    />
                    <span>{Math.round(confidence * 100)}%</span>
                  </label>
                  <div>
                    <AgentContextLink
                      label={card.subject}
                      detail="长期记忆"
                      contextRef={{
                        kind: AgentResourceKind.AGENT_MEMORY_CARD,
                        id: card.id,
                      }}
                    />
                    <Button
                      tone="secondary"
                      onClick={() => setEditingId(undefined)}
                    >
                      取消
                    </Button>
                    <Button
                      icon={Save}
                      type="submit"
                      disabled={
                        update.isPending || !subject.trim() || !claim.trim()
                      }
                    >
                      保存
                    </Button>
                  </div>
                </form>
              ) : (
                <article className="agent-memory-row" key={card.id}>
                  <div>
                    <strong>{card.subject}</strong>
                    <p>{card.claim}</p>
                    <small>
                      置信度 {Math.round(card.confidence * 100)}% · 更新于{' '}
                      {new Date(card.updatedAt).toLocaleString('zh-CN')}
                    </small>
                  </div>
                  <div>
                    <Button
                      icon={Check}
                      tone="quiet"
                      onClick={() => {
                        setEditingId(card.id);
                        setSubject(card.subject);
                        setClaim(card.claim);
                        setConfidence(card.confidence);
                      }}
                    >
                      修正
                    </Button>
                    <Button
                      icon={Trash2}
                      tone="quiet"
                      disabled={suppress.isPending}
                      onClick={() => suppress.mutate(card.id)}
                    >
                      停用
                    </Button>
                  </div>
                </article>
              ),
            )}
          </div>
        </RemoteState>
        {update.error || suppress.error ? (
          <p className="form-error">
            {(update.error ?? suppress.error)?.message}
          </p>
        ) : null}
      </Section>
      <Section>
        <h2>模型用量</h2>
        <RemoteState pending={usage.isPending} error={usage.error}>
          <div className="agent-usage-list">
            {(usage.data ?? []).map((row, index) => (
              <div key={`${row.purpose}:${row.credentialOwnerKind}:${index}`}>
                <span>{row.purpose}</span>
                <strong>
                  {Number(row.units).toLocaleString('zh-CN')} tokens
                </strong>
                <small>
                  {row.credentialOwnerKind} · $
                  {(Number(row.costMicros) / 1_000_000).toFixed(4)}
                </small>
              </div>
            ))}
          </div>
        </RemoteState>
      </Section>
    </div>
  );
}
