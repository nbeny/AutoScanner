import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { browserAuthStorage, type AuthSession, type AuthStorage } from './auth';

interface AuthContextValue {
  session: AuthSession | null;
  login: (s: AuthSession) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  storage?: AuthStorage;
}

export function AuthProvider({ children, storage = browserAuthStorage }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(() => storage.read());

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      login: (s) => {
        storage.write(s);
        setSession(s);
      },
      logout: () => {
        storage.clear();
        setSession(null);
      },
    }),
    [session, storage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
