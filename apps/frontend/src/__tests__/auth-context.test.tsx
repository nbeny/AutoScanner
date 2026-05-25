import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../lib/auth-context';
import type { AuthSession, AuthStorage } from '../lib/auth';

function makeMemoryStorage(initial: AuthSession | null = null): AuthStorage & {
  current: AuthSession | null;
} {
  let value: AuthSession | null = initial;
  return {
    get current() {
      return value;
    },
    read: () => value,
    write: (s) => {
      value = s;
    },
    clear: () => {
      value = null;
    },
  };
}

function Probe() {
  const { session, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="email">{session?.email ?? 'none'}</span>
      <button
        onClick={() =>
          login({
            apiUrl: 'http://api',
            accessToken: 'a',
            refreshToken: 'r',
            email: 'op@example.com',
          })
        }
      >
        login
      </button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  it('starts with no session, persists on login, clears on logout', () => {
    const storage = makeMemoryStorage();
    render(
      <AuthProvider storage={storage}>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId('email')).toHaveTextContent('none');

    act(() => {
      screen.getByText('login').click();
    });
    expect(screen.getByTestId('email')).toHaveTextContent('op@example.com');
    expect(storage.current?.accessToken).toBe('a');

    act(() => {
      screen.getByText('logout').click();
    });
    expect(screen.getByTestId('email')).toHaveTextContent('none');
    expect(storage.current).toBeNull();
  });

  it('rehydrates from storage on mount', () => {
    const storage = makeMemoryStorage({
      apiUrl: 'http://api',
      accessToken: 'a',
      refreshToken: 'r',
      email: 'restored@example.com',
    });
    render(
      <AuthProvider storage={storage}>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId('email')).toHaveTextContent('restored@example.com');
  });
});
