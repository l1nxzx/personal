import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthResponse, LoginRequest, PublicUser, Role } from '../../../shared/types';
import { ApiError, apiFetch } from '../lib/apiFetch';
import { clearPersistedQueries, SIGNED_IN_HINT } from '../lib/queryPersist';
import { readJSON, removeKey, writeJSON } from '../lib/storage';

interface AuthValue {
  user: PublicUser | null;
  /** True only during the initial "who am I?" check. */
  isLoading: boolean;
  /** This device was signed in last time, so the check will most likely find a user. */
  expectUser: boolean;
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
    // Restored from the device on launch (lib/queryPersist.ts), so the app opens offline too;
    // always confirmed with the server, and a gone session signs out and clears the cache.
    refetchOnMount: 'always',
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
      void clearPersistedQueries();
    },
  });

  const user = me.data ?? null;
  const [expectUser] = useState(() => readJSON<boolean>(SIGNED_IN_HINT) === true);
  useEffect(() => {
    if (!me.isSuccess) return;
    if (me.data) {
      writeJSON(SIGNED_IN_HINT, true);
      return;
    }
    // No session: nothing of the owner's may stay on this device.
    removeKey(SIGNED_IN_HINT);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
    void clearPersistedQueries();
  }, [me.isSuccess, me.data, qc]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      // Pending also covers restoring the stored cache (main.tsx), before the check has started.
      isLoading: me.isPending,
      expectUser,
      login: async (input) => void (await login(input)),
      logout: async () => void (await logout()),
      setUser: (u) => qc.setQueryData(ME_KEY, u),
      hasRole: (...roles) => !!user && roles.includes(user.role),
    }),
    [user, me.isPending, expectUser, login, logout, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
