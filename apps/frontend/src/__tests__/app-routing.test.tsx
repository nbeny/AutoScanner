import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { AuthProvider } from '../lib/auth-context';
import { ScopeProvider, type ScopeStorage } from '../lib/scope-context';
import type { AuthSession, AuthStorage } from '../lib/auth';
import { AppRoutes } from '../app-routes';

const session: AuthSession = {
  apiUrl: 'http://api',
  accessToken: 'a',
  refreshToken: 'r',
  email: 'op@example.com',
};

function authStorage(initial: AuthSession | null): AuthStorage {
  let v = initial;
  return {
    read: () => v,
    write: (s) => {
      v = s;
    },
    clear: () => {
      v = null;
    },
  };
}
function scopeStorage(): ScopeStorage {
  let v: string | null = null;
  return {
    read: () => v,
    write: (id) => {
      v = id;
    },
    clear: () => {
      v = null;
    },
  };
}

function renderAt(path: string, sess: AuthSession | null) {
  return render(
    <MockedProvider mocks={[]} addTypename={false}>
      <AuthProvider storage={authStorage(sess)}>
        <ScopeProvider storage={scopeStorage()}>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes email={sess?.email ?? ''} onLogout={() => undefined} />
          </MemoryRouter>
        </ScopeProvider>
      </AuthProvider>
    </MockedProvider>,
  );
}

describe('app routing (target IA)', () => {
  it('sends unauthenticated users to the login screen', () => {
    renderAt('/', null);
    expect(screen.getByLabelText('login-page')).toBeInTheDocument();
  });

  it('renders the Cockpit-interim (scans) at /', () => {
    renderAt('/', session);
    expect(screen.getByLabelText('cockpit-command-bar')).toBeInTheDocument();
  });

  it('redirects /dashboard to the Cockpit', () => {
    renderAt('/dashboard', session);
    expect(screen.getByLabelText('cockpit-command-bar')).toBeInTheDocument();
  });

  it('redirects /scans to the Cockpit', () => {
    renderAt('/scans', session);
    expect(screen.getByLabelText('cockpit-command-bar')).toBeInTheDocument();
  });

  it('renders the Audit page at /audit and redirects /vulnerabilities to it', () => {
    renderAt('/vulnerabilities', session);
    expect(screen.getByLabelText('vulnerabilities-section')).toBeInTheDocument();
  });

  it('renders the IP Library at /targets', () => {
    renderAt('/targets', session);
    expect(screen.getByLabelText('targets-library')).toBeInTheDocument();
  });
});
