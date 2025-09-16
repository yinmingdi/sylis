import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  user: any;
  token: string | null;
  setUser: (user: any) => void;
  setToken: (token: string) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      logout: () => set({ user: null, token: null }),
    }),
    {
      name: 'user-store', // 本地存储的 key
      partialize: (state) => ({ token: state.token }), // 只持久化 token
    },
  ),
);
