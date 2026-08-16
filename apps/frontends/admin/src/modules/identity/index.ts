import { adminApiClient, type AdminSessionView } from "@sylis/api-client/admin";
import { useQuery, type QueryClient } from "@tanstack/react-query";

export const adminSessionQuery = {
  queryKey: ["admin", "session"] as const,
  queryFn: () => adminApiClient.auth.session(),
  retry: false,
};

export interface AdminQueryScope {
  operatorId: string;
  sessionId: string;
  roleKey: string;
}

export function adminSessionScope(session: AdminSessionView): AdminQueryScope {
  return {
    operatorId: session.actor.id,
    sessionId: session.session.id,
    roleKey: [...session.roles].sort().join(","),
  };
}

export function useAdminQueryScope(): AdminQueryScope {
  const session = useQuery(adminSessionQuery);
  if (!session.data) throw new Error("ADMIN_SESSION_REQUIRED");
  return adminSessionScope(session.data);
}

export const adminQueryKey = <const TSegments extends readonly unknown[]>(
  scope: AdminQueryScope,
  ...segments: TSegments
) =>
  [
    "admin-scope",
    scope.operatorId,
    scope.sessionId,
    scope.roleKey,
    ...segments,
  ] as const;

export async function clearAdminQueryScope(
  cache: QueryClient,
  scope?: AdminQueryScope,
): Promise<void> {
  const belongsToScope = (queryKey: readonly unknown[]) =>
    queryKey[0] === "admin-scope" &&
    (scope === undefined ||
      (queryKey[1] === scope.operatorId &&
        queryKey[2] === scope.sessionId &&
        queryKey[3] === scope.roleKey));
  await cache.cancelQueries({
    predicate: (query) => belongsToScope(query.queryKey),
  });
  cache.removeQueries({
    predicate: (query) => belongsToScope(query.queryKey),
  });
  cache.getMutationCache().clear();
}

export async function resetAdminClientState(cache: QueryClient): Promise<void> {
  await clearAdminQueryScope(cache);
  cache.removeQueries({ queryKey: adminSessionQuery.queryKey });
  adminApiClient.setCsrfToken(null);
}

export const adminIdentityCommands = adminApiClient.auth;
export * from "./admin-reauthentication";
