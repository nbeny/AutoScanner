import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth-context';
import { RestApiError, restLogin } from '../../lib/api-rest';

const DEFAULT_API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const auth = await restLogin(apiUrl, email, password);
      login({
        apiUrl,
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        email,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof RestApiError && err.status === 401) {
        setError('Invalid credentials');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 bg-slate-900 p-6 rounded-lg shadow"
        aria-label="login"
      >
        <h1 className="text-xl font-semibold">Sign in to AutoScanner</h1>
        <label className="block">
          <span className="text-sm text-slate-300">API URL</span>
          <input
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-300">Email</span>
          <input
            type="email"
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-300">Password</span>
          <input
            type="password"
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded py-2 font-medium"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
