'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearSession, refreshSession, setSession } from '@/lib/api';

export interface User {
  id: string;
  userId?: string;
  username: string;
  displayName?: string;
  email?: string;
  role?: 'user' | 'creator' | 'moderator' | 'admin';
  avatarUrl?: string;
  bio?: string;
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
  interests?: string[];
  a11yVerified?: boolean;
  isFollowing?: boolean;
  isSelf?: boolean;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (identifier: string, password: string) => Promise<void>;
  oauthLogin: (provider: 'google' | 'github' | 'apple' | 'magic_link', email?: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toSession(session: { accessToken: string; refreshToken: string }) {
  setSession({ accessToken: session.accessToken, refreshToken: session.refreshToken });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // Hydrate: refresh token persisted by setSession on a previous visit.
  useEffect(() => {
    if (!window.localStorage.getItem('ax-refresh-token')) {
      setStatus('unauthenticated');
      return;
    }
    void refreshSession()
      .then((res) => {
        setUser(res.user as User);
        setStatus('authenticated');
      })
      .catch(() => {
        clearSession();
        setStatus('unauthenticated');
      });
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await api.auth.login({ identifier, password, deviceName: 'Web' });
    toSession(res);
    setUser(res.user as User);
    setStatus('authenticated');
  }, []);

  const oauthLogin = useCallback(async (provider: 'google' | 'github' | 'apple' | 'magic_link', email?: string) => {
    const res = await api.auth.oauth({ provider, email });
    toSession(res);
    setUser(res.user as User);
    setStatus('authenticated');
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const res = await api.auth.register({ username, email, password, locale: 'en' });
    toSession(res);
    setUser(res.user as User);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* ignore network errors on logout */
    }
    clearSession();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await api.users.me<User>();
    setUser(me);
  }, []);

  const value = useMemo(
    () => ({ user, status, login, oauthLogin, register, logout, refreshUser }),
    [user, status, login, oauthLogin, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
