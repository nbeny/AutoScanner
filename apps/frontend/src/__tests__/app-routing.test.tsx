import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from '../lib/auth-context';
import type { AuthSession, AuthStorage } from '../lib/auth';

function makeMemoryStorage(initial: AuthSession | null = null): AuthStorage {
  let value: AuthSession | null = initial;
  return {
    read: () => value,
    write: (s) => {
      value = s;
    },
    clear: () => {
      value = null;
    },
  };
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function renderAt(path: string, storage: AuthStorage) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider storage={storage}>
        <Routes>
          <Route path="/login" element={<div>login screen</div>} />
          <Route
            path="/engagements"
            element={
              <RequireAuth>
                <div>engagements screen</div>
              </RequireAuth>
            }
          />
          <Route
            path="/scans"
            element={
              <RequireAuth>
                <div>scans screen</div>
              </RequireAuth>
            }
          />
          <Route
            path="/vulnerabilities"
            element={
              <RequireAuth>
                <div>vulns screen</div>
              </RequireAuth>
            }
          />
          <Route
            path="/tools"
            element={
              <RequireAuth>
                <div>tools screen</div>
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('app routing', () => {
  it('redirects unauthenticated users from protected route to /login', () => {
    renderAt('/engagements', makeMemoryStorage(null));
    expect(screen.getByText('login screen')).toBeInTheDocument();
  });

  it('renders protected route when session exists', () => {
    renderAt(
      '/engagements',
      makeMemoryStorage({
        apiUrl: 'http://api',
        accessToken: 'a',
        refreshToken: 'r',
        email: 'op@example.com',
      }),
    );
    expect(screen.getByText('engagements screen')).toBeInTheDocument();
  });

  it('renders the scans section for an authenticated user', () => {
    renderAt(
      '/scans',
      makeMemoryStorage({
        apiUrl: 'http://api',
        accessToken: 'a',
        refreshToken: 'r',
        email: 'op@example.com',
      }),
    );
    expect(screen.getByText('scans screen')).toBeInTheDocument();
  });

  it('redirects unauthenticated users from /vulnerabilities to /login', () => {
    renderAt('/vulnerabilities', makeMemoryStorage(null));
    expect(screen.getByText('login screen')).toBeInTheDocument();
  });
});
