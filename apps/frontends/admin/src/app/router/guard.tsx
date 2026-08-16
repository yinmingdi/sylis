import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Navigate, Outlet } from "react-router-dom";

import {
  adminSessionQuery,
  adminSessionScope,
  clearAdminQueryScope,
  type AdminQueryScope,
} from "../../modules/identity";

export function AdminGuard() {
  const cache = useQueryClient();
  const session = useQuery(adminSessionQuery);
  const previousScope = useRef<AdminQueryScope | undefined>(undefined);
  const scope = session.data ? adminSessionScope(session.data) : undefined;
  const scopeKey = scope
    ? `${scope.operatorId}:${scope.sessionId}:${scope.roleKey}`
    : undefined;
  useEffect(() => {
    const previous = previousScope.current;
    previousScope.current = scope;
    if (
      previous &&
      scope &&
      (previous.operatorId !== scope.operatorId ||
        previous.sessionId !== scope.sessionId ||
        previous.roleKey !== scope.roleKey)
    ) {
      void clearAdminQueryScope(cache, previous);
    }
  }, [cache, scope, scopeKey]);
  if (session.isPending) return <div className="admin-loading">载入中</div>;
  if (session.isError) return <Navigate to="/login" replace />;
  return <Outlet key={scopeKey} />;
}
