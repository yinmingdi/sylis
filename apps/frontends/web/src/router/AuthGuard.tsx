import { agentClient } from '@sylis/api-client/agent';
import { apiClient } from '@sylis/api-client/user';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useUserStore } from '../modules/user/store';

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, setUser, setToken, logout } = useUserStore();
  const navigate = useNavigate();
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    apiClient.identity
      .session()
      .then((session) => {
        apiClient.setCsrfToken(session.csrfToken);
        agentClient.setCsrfToken(session.csrfToken);
        setToken('cookie-session');
        setUser(session.actor);
        setSessionReady(true);
      })
      .catch(() => {
        logout();
        navigate('/login', { replace: true });
      });
  }, [setUser, setToken, logout, navigate]);

  if (!user || !sessionReady) {
    return null; // 或者 loading 状态
  }

  return <>{children}</>;
};
