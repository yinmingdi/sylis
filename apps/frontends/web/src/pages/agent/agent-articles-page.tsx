import { AgentArtifactKind } from '@sylis/api-client/agent';
import { ArrowLeft, BookOpen, IconButton } from '@sylis/components';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  AgentInspectionKind,
  AgentInspector,
  agentQueries,
} from '../../modules/agent';
import { useCurrentUserId } from '../../modules/identity';
import { RemoteState } from '../page-utils';

export function AgentArticlesPage() {
  const userId = useCurrentUserId();
  const navigate = useNavigate();
  const artifacts = useQuery(agentQueries.artifacts(userId));
  const [artifactId, setArtifactId] = useState<string>();
  const articles = (artifacts.data ?? []).filter(
    (artifact) => artifact.kind === AgentArtifactKind.ARTICLE,
  );

  return (
    <main className="page agent-articles-page">
      <header className="agent-task-page__header">
        <IconButton
          icon={ArrowLeft}
          label="返回 AI 功能"
          onClick={() => navigate('/agent')}
        />
        <div>
          <h1>我的文章</h1>
          <p>{articles.length} 篇 AI 生成文章</p>
        </div>
      </header>
      <RemoteState
        pending={artifacts.isPending}
        error={artifacts.error}
        empty={!artifacts.isPending && articles.length === 0}
      >
        <div className="agent-article-list">
          {articles.map((article) => (
            <button
              key={article.id}
              type="button"
              onClick={() => setArtifactId(article.id)}
            >
              <BookOpen aria-hidden="true" />
              <span>
                <strong>{article.title}</strong>
                <small>
                  {article.currentRevision
                    ? `版本 ${article.currentRevision.revisionNo}`
                    : '等待生成'}
                </small>
              </span>
              <time dateTime={article.createdAt}>
                {new Date(article.createdAt).toLocaleDateString('zh-CN')}
              </time>
            </button>
          ))}
        </div>
      </RemoteState>
      <AgentInspector
        inspection={
          artifactId
            ? { kind: AgentInspectionKind.ARTIFACT, id: artifactId }
            : null
        }
        onClose={() => setArtifactId(undefined)}
      />
    </main>
  );
}
