import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface ScopeStorage {
  read: () => string | null;
  write: (id: string) => void;
  clear: () => void;
}

const KEY = 'scope.engagementId';

export const browserScopeStorage: ScopeStorage = {
  read: () => (typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null),
  write: (id) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, id);
  },
  clear: () => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
  },
};

interface ScopeContextValue {
  engagementId: string | null;
  setScope: (id: string | null) => void;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

export function ScopeProvider({
  children,
  storage = browserScopeStorage,
}: {
  children: ReactNode;
  storage?: ScopeStorage;
}) {
  const [engagementId, setEngagementId] = useState<string | null>(() => storage.read());
  const value = useMemo<ScopeContextValue>(
    () => ({
      engagementId,
      setScope: (id) => {
        if (id) {
          storage.write(id);
          setEngagementId(id);
        } else {
          storage.clear();
          setEngagementId(null);
        }
      },
    }),
    [engagementId, storage],
  );
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope must be used inside <ScopeProvider>');
  return ctx;
}
