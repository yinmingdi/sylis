import type { AgentArtifactDocument } from '@sylis/api-client/agent';
import {
  Button,
  Check,
  FileText,
  IconButton,
  Paperclip,
  Save,
  Select,
  SquarePen,
  X,
} from '@sylis/components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { AgentArtifactDocumentView } from './artifact-document';
import { useCurrentUserId } from '../../identity';
import { agentCommands } from '../api/commands';
import { agentQueries } from '../api/queries';
import { artifactContextSelection } from '../model/artifact-selection';
import type { AgentComposerContextItem } from '../model/composer-state';

export function AgentArtifactInspector({
  artifactId,
  onClose,
  onUseContext,
}: {
  artifactId: string;
  onClose: () => void;
  onUseContext?: (item: AgentComposerContextItem) => void;
}) {
  const userId = useCurrentUserId();
  const query = useQuery(agentQueries.artifact(userId, artifactId));
  const cache = useQueryClient();
  const [revisionId, setRevisionId] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const artifact = query.data;
  useEffect(() => {
    setRevisionId(
      artifact?.currentRevisionId ?? artifact?.revisions[0]?.id ?? '',
    );
  }, [artifact?.currentRevisionId, artifact?.revisions]);
  const revision = artifact?.revisions.find((item) => item.id === revisionId);
  useEffect(() => {
    setDraft(
      revision?.document ? JSON.stringify(revision.document, null, 2) : '',
    );
    setEditing(false);
  }, [revision?.document, revision?.id]);
  const revise = useMutation({
    mutationFn: () =>
      agentCommands.artifacts.revise(
        artifactId,
        parseArtifactDocument(draft),
        crypto.randomUUID(),
      ),
    onSuccess: async (created) => {
      setRevisionId(created.id);
      setEditing(false);
      await Promise.all([
        cache.invalidateQueries({
          queryKey: agentQueries.artifact(userId, artifactId).queryKey,
        }),
        cache.invalidateQueries({
          queryKey: agentQueries.artifacts(userId).queryKey,
        }),
      ]);
    },
  });
  const accept = useMutation({
    mutationFn: async () => {
      const preview = await agentCommands.artifacts.acceptancePreview(
        artifactId,
        revisionId,
      );
      return agentCommands.artifacts.acceptAsAsset(artifactId, {
        artifactRevisionId: preview.artifactRevisionId,
        actionDigest: preview.actionDigest,
        idempotencyKey: crypto.randomUUID(),
      });
    },
    onSuccess: async () => {
      await cache.invalidateQueries({
        queryKey: agentQueries.assets(userId).queryKey,
      });
    },
  });
  return (
    <section className="agent-inspector__content" aria-label="成果检查器">
      <header>
        <div>
          <span>成果</span>
          <h2>{artifact?.title ?? '载入中'}</h2>
        </div>
        <IconButton icon={X} label="关闭检查器" onClick={onClose} />
      </header>
      {query.error ? <p className="form-error">{query.error.message}</p> : null}
      {artifact ? (
        <>
          <div className="agent-artifact__meta">
            <FileText aria-hidden="true" size={17} />
            <span>{artifact.kind}</span>
            <Select
              aria-label="成果版本"
              value={revisionId}
              onChange={(event) => setRevisionId(event.target.value)}
            >
              {artifact.revisions.map((item) => (
                <option key={item.id} value={item.id}>
                  版本 {item.revisionNo}
                </option>
              ))}
            </Select>
          </div>
          <article className="agent-artifact__body">
            {editing ? (
              <textarea
                aria-label="成果正文"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            ) : revision?.document ? (
              <AgentArtifactDocumentView document={revision.document} />
            ) : (
              <p>该版本没有可显示的正文</p>
            )}
          </article>
          {revision ? (
            <div className="agent-inspector__actions agent-artifact__actions">
              {editing ? (
                <>
                  <Button
                    tone="secondary"
                    disabled={revise.isPending}
                    onClick={() => setEditing(false)}
                  >
                    取消
                  </Button>
                  <Button
                    icon={Save}
                    disabled={revise.isPending || !draft.trim()}
                    onClick={() => revise.mutate()}
                  >
                    保存新版本
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    icon={SquarePen}
                    tone="quiet"
                    onClick={() => setEditing(true)}
                  >
                    编辑
                  </Button>
                  {onUseContext ? (
                    <Button
                      icon={Paperclip}
                      tone="quiet"
                      onClick={() =>
                        onUseContext(
                          artifactContextSelection(artifact, revision),
                        )
                      }
                    >
                      加入上下文
                    </Button>
                  ) : null}
                  <Button
                    icon={Check}
                    disabled={accept.isPending || accept.isSuccess}
                    onClick={() => accept.mutate()}
                  >
                    {accept.isSuccess ? '已保存为文件' : '接受为文件'}
                  </Button>
                </>
              )}
            </div>
          ) : null}
          {revise.error ? (
            <p className="form-error">{revise.error.message}</p>
          ) : null}
          {accept.error ? (
            <p className="form-error">{accept.error.message}</p>
          ) : null}
          {revision ? (
            <dl className="agent-inspector__facts">
              <div>
                <dt>内容摘要</dt>
                <dd className="agent-digest">{revision.contentHash}</dd>
              </div>
              <div>
                <dt>生成时间</dt>
                <dd>{new Date(revision.createdAt).toLocaleString('zh-CN')}</dd>
              </div>
            </dl>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function parseArtifactDocument(value: string): AgentArtifactDocument {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as AgentArtifactDocument;
    }
  } catch {
    // Use the stable user-facing error below.
  }
  throw new Error('成果 JSON 格式无效');
}
