const STORAGE_KEY = 'autoscanner:auth';

export interface AuthSession {
  apiUrl: string;
  accessToken: string;
  refreshToken: string;
  email: string;
}

export interface AuthStorage {
  read(): AuthSession | null;
  write(session: AuthSession): void;
  clear(): void;
}

export const browserAuthStorage: AuthStorage = {
  read(): AuthSession | null {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthSession;
    } catch {
      return null;
    }
  },
  write(session: AuthSession): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  },
  clear(): void {
    window.localStorage.removeItem(STORAGE_KEY);
  },
};
