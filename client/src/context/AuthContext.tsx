import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { AuthResponse, LoginRequest, PublicUser, Role } from '../../../shared/types';
import { ApiError, apiFetch } from '../lib/apiFetch';
import { removeKey } from '../lib/storage';

interface AuthValue {
  user: PublicUser | null;
  /** True only during the initial "who am I?" check. */
  isLoading: boolean;
  login: (input: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  /** Replace the cached user after a profile change. */
  setUser: (user: PublicUser) => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);
export const ME_KEY = ['me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return (await apiFetch<AuthResponse>('/auth/me')).user;
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
        throw err;
      }
    },
    staleTime: Infinity,
  });

  const { mutateAsync: login } = useMutation({
    mutationFn: (input: LoginRequest) =>
      apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: input }),
    onSuccess: ({ user }) => qc.setQueryData(ME_KEY, user),
  });
  const { mutateAsync: logout } = useMutation({
    mutationFn: () => apiFetch('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear(); // drop every cached query so nothing lingers on this device
      qc.setQueryData(ME_KEY, null);
      removeKey('capture:draft');
    },
  });

  const user = me.data ?? null;

  const value = useMemo<AuthValue>(
    () => ({
      user,
      isLoading: me.isLoading,
      login: async (input) => void (await login(input)),
      logout: async () => void (await logout()),
      setUser: (u) => qc.setQueryData(ME_KEY, u),
      hasRole: (...roles) => !!user && roles.includes(user.role),
    }),
    [user, me.isLoading, login, logout, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
