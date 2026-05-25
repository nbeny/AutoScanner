import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import { CREATE_ENGAGEMENT_MUTATION, ENGAGEMENTS_QUERY } from '../../lib/graphql/queries';

interface EngagementRow {
  id: string;
  name: string;
  clientName: string;
  status: string;
  createdAt: string;
}

export function EngagementsListPage() {
  const { data, loading, error, refetch } = useQuery<{ engagements: EngagementRow[] }>(
    ENGAGEMENTS_QUERY,
  );
  const [createEngagement, { loading: creating, error: createError }] = useMutation(
    CREATE_ENGAGEMENT_MUTATION,
  );
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await createEngagement({ variables: { input: { name, clientName } } });
    setName('');
    setClientName('');
    await refetch();
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Engagements</h1>
      </header>

      <form
        onSubmit={onCreate}
        className="flex gap-3 items-end bg-slate-900 p-4 rounded"
        aria-label="create-engagement"
      >
        <label className="flex-1">
          <span className="block text-xs text-slate-300">Name</span>
          <input
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="flex-1">
          <span className="block text-xs text-slate-300">Client</span>
          <input
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            required
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded px-4 py-2"
        >
          {creating ? 'Creating…' : 'Create'}
        </button>
      </form>
      {createError ? (
        <p className="text-sm text-red-400" role="alert">
          {createError.message}
        </p>
      ) : null}

      {loading ? <p className="text-slate-400">Loading…</p> : null}
      {error ? (
        <p className="text-red-400" role="alert">
          {error.message}
        </p>
      ) : null}

      {data ? (
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-left">
            <tr>
              <th className="py-2">Name</th>
              <th>Client</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.engagements.map((e) => (
              <tr key={e.id} className="border-t border-slate-800">
                <td className="py-2">{e.name}</td>
                <td>{e.clientName}</td>
                <td>{e.status}</td>
                <td className="text-right">
                  <Link
                    to={`/engagements/${e.id}/scans`}
                    className="text-indigo-400 hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {data.engagements.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-400">
                  No engagements yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
