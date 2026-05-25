import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../../lib/auth-context';
import type { AuthSession, AuthStorage } from '../../../lib/auth';
import { LoginPage } from '../login-page';

function makeMemoryStorage(): AuthStorage & { current: AuthSession | null } {
  let value: AuthSession | null = null;
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

function renderLogin(storage: AuthStorage) {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider storage={storage}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/engagements" element={<div>engagements screen</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('<LoginPage />', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves session and navigates to /engagements on successful login', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const storage = makeMemoryStorage();
    renderLogin(storage);

    fireEvent.change(screen.getByLabelText('API URL'), { target: { value: 'http://api.example' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'op@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByRole('form', { name: 'login' }));

    await waitFor(() => expect(screen.getByText('engagements screen')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.example/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'op@example.com', password: 'secret' }),
      }),
    );
    expect(storage.current).toEqual({
      apiUrl: 'http://api.example',
      accessToken: 'a',
      refreshToken: 'r',
      email: 'op@example.com',
    });
  });

  it('shows an error message on 401 and does not navigate', async () => {
    fetchMock.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    const storage = makeMemoryStorage();
    renderLogin(storage);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'op@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'bad' } });
    fireEvent.submit(screen.getByRole('form', { name: 'login' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
    expect(screen.queryByText('engagements screen')).not.toBeInTheDocument();
    expect(storage.current).toBeNull();
  });
});
