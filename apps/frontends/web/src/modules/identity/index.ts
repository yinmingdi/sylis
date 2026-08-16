import { agentClient } from '@sylis/api-client/agent';
import { apiClient } from '@sylis/api-client/user';
import { useQuery, type QueryClient } from '@tanstack/react-query';

export const sessionQuery = {
  queryKey: ['identity', 'session'] as const,
  queryFn: () => apiClient.identity.session(),
  retry: false,
};

export const userQueryKey = <const TSegments extends readonly unknown[]>(
  userId: string,
  ...segments: TSegments
) => ['user', userId, ...segments] as const;

export function useCurrentUserId(): string {
  const session = useQuery(sessionQuery);
  if (!session.data) throw new Error('AUTHENTICATED_SESSION_REQUIRED');
  return session.data.actor.id;
}

export async function clearUserQueryScope(
  cache: QueryClient,
  userId?: string,
): Promise<void> {
  const belongsToUser = (queryKey: readonly unknown[]) =>
    queryKey[0] === 'user' && (userId === undefined || queryKey[1] === userId);
  await cache.cancelQueries({
    predicate: (query) => belongsToUser(query.queryKey),
  });
  cache.removeQueries({
    predicate: (query) => belongsToUser(query.queryKey),
  });
  cache.getMutationCache().clear();
}

export async function resetAuthenticatedClientState(
  cache: QueryClient,
): Promise<void> {
  await clearUserQueryScope(cache);
  cache.removeQueries({ queryKey: sessionQuery.queryKey });
  apiClient.setCsrfToken(null);
  agentClient.setCsrfToken(null);
}

export const sessionsQuery = (userId: string) => ({
  queryKey: userQueryKey(userId, 'identity', 'sessions'),
  queryFn: () => apiClient.identity.sessions(),
});

export const consentsQuery = (userId: string) => ({
  queryKey: userQueryKey(userId, 'identity', 'consents'),
  queryFn: () => apiClient.identity.consents(),
});

export function activeConsentId(value: unknown, purpose: string) {
  if (!Array.isArray(value)) return undefined;
  const record = value.find(
    (item) =>
      item &&
      typeof item === 'object' &&
      (item as Record<string, unknown>).purpose === purpose,
  ) as Record<string, unknown> | undefined;
  return record?.decision === 'GRANTED' && typeof record.id === 'string'
    ? record.id
    : undefined;
}

export const identityCommands = apiClient.identity;
export const dataCommands = apiClient.data;
export const modelCredentialCommands = apiClient.modelCredentials;

export const modelCredentialsQuery = (userId: string) => ({
  queryKey: userQueryKey(userId, 'identity', 'model-credentials'),
  queryFn: () => apiClient.modelCredentials.list(),
});

export const supportGrantCommands = apiClient.supportGrants;

export const supportGrantsQuery = (userId: string) => ({
  queryKey: userQueryKey(userId, 'identity', 'support-grants'),
  queryFn: () => apiClient.supportGrants.list(),
});
