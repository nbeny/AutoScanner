import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import {
  API_CREDENTIALS_QUERY,
  DELETE_API_CREDENTIAL,
  SET_API_CREDENTIAL,
} from '../../lib/graphql/queries';
import { formatDate } from '../../lib/format-date';

type ApiProvider = 'SHODAN' | 'CENSYS';

interface ApiCredentialInfo {
  provider: ApiProvider;
  createdAt: string;
}

const PROVIDERS: ApiProvider[] = ['SHODAN', 'CENSYS'];

export function ApiKeysPanel() {
  const { data, loading, error } = useQuery<{ apiCredentials: ApiCredentialInfo[] }>(
    API_CREDENTIALS_QUERY,
  );

  const [setApiCredential, { loading: saving }] = useMutation(SET_API_CREDENTIAL, {
    refetchQueries: [{ query: API_CREDENTIALS_QUERY }],
  });
  const [deleteApiCredential, { loading: deleting }] = useMutation(DELETE_API_CREDENTIAL, {
    refetchQueries: [{ query: API_CREDENTIALS_QUERY }],
  });

  const [provider, setProvider] = useState<ApiProvider>('SHODAN');
  const [secret, setSecret] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!secret) return;
    await setApiCredential({ variables: { provider, secret } });
    setSecret('');
  }

  async function handleDelete(p: ApiProvider) {
    await deleteApiCredential({ variables: { provider: p } });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">API Keys</h2>

      {loading && <p className="text-slate-400 text-sm">Loading credentials…</p>}
      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error.message}
        </p>
      )}

      {!loading && !error && (
        <div className="space-y-2">
          {(data?.apiCredentials ?? []).length === 0 ? (
            <p className="text-slate-500 text-sm">No API keys configured.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-slate-400 text-left">
                <tr>
                  <th className="py-2">Provider</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data?.apiCredentials ?? []).map((cred) => (
                  <tr key={cred.provider} className="border-t border-slate-800">
                    <td className="py-2 font-mono">{cred.provider}</td>
                    <td className="text-xs text-slate-400">{formatDate(cred.createdAt)}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(cred.provider)}
                        disabled={deleting}
                        className="text-xs text-red-400 hover:underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-3 border border-slate-800 rounded p-4">
        <h3 className="text-sm font-medium text-slate-300">Add / replace API key</h3>
        <div className="flex gap-3 items-end">
          <div className="space-y-1">
            <label htmlFor="api-provider" className="text-xs text-slate-400">
              Provider
            </label>
            <select
              id="api-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as ApiProvider)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 flex-1">
            <label htmlFor="api-secret" className="text-xs text-slate-400">
              Key
            </label>
            <input
              id="api-secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Paste your API key"
              autoComplete="new-password"
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving || !secret}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
