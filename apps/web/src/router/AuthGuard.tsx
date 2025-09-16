import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { getUser } from '../modules/user/api';
import { useUserStore } from '../modules/user/store';

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
    const { user, token, setUser } = useUserStore();
    const navigate = useNavigate();

    useEffect(() => {
        if (token && !user) {
            getUser()
                .then(res => {
                    setUser(res.data);
                })
                .catch(() => {
                    navigate('/login');
                });
        } else if (!token) {
            navigate('/login');
        }
    }, [token, user, setUser, navigate]);

    if (!user) {
        return null; // 或者 loading 状态
    }

    return <>{children}</>;
};