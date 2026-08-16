import { agentClient } from '@sylis/api-client/agent';
import { queryOptions } from '@tanstack/react-query';

import { userQueryKey } from '../../identity';

export const agentQueries = {
  sessions: (userId: string) =>
    queryOptions({
      queryKey: userQueryKey(userId, 'agent', 'sessions'),
      queryFn: () => agentClient.sessions.list(),
    }),
  session: (userId: string, sessionId: string) =>
    queryOptions({
      queryKey: userQueryKey(userId, 'agent', 'sessions', sessionId),
      queryFn: () => agentClient.sessions.get(sessionId),
      enabled: Boolean(sessionId),
    }),
  messages: (userId: string, sessionId: string) =>
    queryOptions({
      queryKey: userQueryKey(
        userId,
        'agent',
        'sessions',
        sessionId,
        'messages',
      ),
      queryFn: () => agentClient.sessions.messages(sessionId),
      enabled: Boolean(sessionId),
    }),
  runs: (userId: string, sessionId: string) =>
    queryOptions({
      queryKey: userQueryKey(userId, 'agent', 'sessions', sessionId, 'runs'),
      queryFn: () => agentClient.sessions.runs(sessionId),
      enabled: Boolean(sessionId),
    }),
  capabilities: (userId: string) =>
    queryOptions({
      queryKey: userQueryKey(userId, 'agent', 'capabilities'),
      queryFn: () => agentClient.capabilities(),
    }),
  artifacts: (userId: string) =>
    queryOptions({
      queryKey: userQueryKey(userId, 'agent', 'artifacts'),
      queryFn: () => agentClient.artifacts.list(),
    }),
  assets: (userId: string) =>
    queryOptions({
      queryKey: userQueryKey(userId, 'agent', 'assets'),
      queryFn: () => agentClient.assets.list(),
    }),
  asset: (userId: string, assetId: string) =>
    queryOptions({
      queryKey: userQueryKey(userId, 'agent', 'assets', assetId),
      queryFn: () => agentClient.assets.get(assetId),
      enabled: Boolean(assetId),
    }),
  memory: (userId: string) =>
    queryOptions({
      queryKey: userQueryKey(userId, 'agent', 'memory'),
      queryFn: () => agentClient.memory.list(),
    }),
  usage: (userId: string) =>
    queryOptions({
      queryKey: userQueryKey(userId, 'agent', 'usage'),
      queryFn: () => agentClient.usage(),
    }),
  diagnostics: (userId: string) =>
    queryOptions({
      queryKey: userQueryKey(userId, 'agent', 'diagnostics'),
      queryFn: () => agentClient.diagnostics.list(),
    }),
  diagnostic: (userId: string, bundleId: string) =>
    queryOptions({
      queryKey: userQueryKey(userId, 'agent', 'diagnostics', bundleId),
      queryFn: () => agentClient.diagnostics.get(bundleId),
      enabled: Boolean(bundleId),
    }),
  artifact: (userId: string, artifactId: string) =>
    queryOptions({
      queryKey: userQueryKey(userId, 'agent', 'artifacts', artifactId),
      queryFn: () => agentClient.artifacts.get(artifactId),
      enabled: Boolean(artifactId),
    }),
  proposal: (userId: string, proposalId: string) =>
    queryOptions({
      queryKey: userQueryKey(userId, 'agent', 'proposals', proposalId),
      queryFn: () => agentClient.proposals.get(proposalId),
      enabled: Boolean(proposalId),
    }),
};
