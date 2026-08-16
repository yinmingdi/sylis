import { agentClient } from '@sylis/api-client/agent';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { clearUserQueryScope, sessionQuery } from '../../modules/identity';

export function SessionGuard() {
  const location = useLocation();
  const cache = useQueryClient();
  const session = useQuery(sessionQuery);
  const previousUserId = useRef<string | undefined>(undefined);
  const userId = session.data?.actor.id;
  useEffect(() => {
    agentClient.setCsrfToken(session.data?.csrfToken ?? null);
  }, [session.data?.csrfToken]);
  useEffect(() => {
    const previous = previousUserId.current;
    previousUserId.current = userId;
    if (previous && userId && previous !== userId) {
      void clearUserQueryScope(cache, previous);
    }
  }, [cache, userId]);
  if (session.isPending)
    return <div className="app-boot" role="status" aria-label="正在载入" />;
  if (session.isError)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet key={userId} />;
}
