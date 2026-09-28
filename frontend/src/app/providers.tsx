import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '../services/api/client';
import { closeSocket } from '../services/socket/socket';
import type { Role, User } from '../types';

interface AuthState {
  user: User | null;
  ready: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): void;
  can(role: Role): boolean;
}

const AuthContext = createContext<AuthState>(null!);
const RANK: Record<Role, number> = { VIEWER: 1, OPERATOR: 2, ADMIN: 3 };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    tokenStore.set(null);
    closeSocket();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) {
      setReady(true);
      return;
    }
    api
      .get<User>('/auth/me')
      .then(setUser)
      .catch(logout)
      .finally(() => setReady(true));
  }, [logout]);

  const login = async (email: string, password: string) => {
    const r = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
    tokenStore.set(r.token);
    setUser(r.user);
  };

  // UI hint only: the backend enforces roles on every request.
  const can = (role: Role) => !!user && RANK[user.role] >= RANK[role];

  return <AuthContext.Provider value={{ user, ready, login, logout, can }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
