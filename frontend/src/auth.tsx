import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';

export type User = {
  id: string;
  email: string | null;
  name: string;
  role: 'user' | 'admin';
  is_guest: boolean;
  xp: number;
  coins: number;
  elo: number;
  streak: number;
  longest_streak: number;
  badges: string[];
  wins: number;
  losses: number;
  draws: number;
  premium: boolean;
  avatar?: string | null;
};

type Ctx = {
  user: User | null | undefined; // undefined = loading
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signInAsGuest: () => Promise<void>;
  upgradeGuest: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUserState(null);
      return;
    }
    try {
      const r = await api.me();
      setUserState(r.user);
    } catch {
      await setToken(null);
      setUserState(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = async (email: string, password: string) => {
    const r = await api.login(email, password);
    await setToken(r.token);
    setUserState(r.user);
  };

  const signUp = async (email: string, password: string, name: string) => {
    const r = await api.register(email, password, name);
    await setToken(r.token);
    setUserState(r.user);
  };

  const signInAsGuest = async () => {
    const r = await api.guest();
    await setToken(r.token);
    setUserState(r.user);
  };

  const upgradeGuest = async (email: string, password: string, name: string) => {
    const r = await api.upgrade(email, password, name);
    await setToken(r.token);
    setUserState(r.user);
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {}
    await setToken(null);
    setUserState(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        signIn,
        signUp,
        signInAsGuest,
        upgradeGuest,
        signOut,
        refresh,
        setUser: (u: User) => setUserState(u),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
