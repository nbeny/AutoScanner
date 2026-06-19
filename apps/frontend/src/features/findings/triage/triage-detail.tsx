import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import {
  CORRELATED_FINDING_DETAIL_QUERY,
  SET_FINDING_NOTE,
  SET_FINDING_REMEDIATION,
} from '../../../lib/graphql/queries';

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-red-700 text-red-50',
  HIGH: 'bg-orange-600 text-orange-50',
  MEDIUM: 'bg-yellow-600 text-yellow-50',
  LOW: 'bg-blue-600 text-blue-50',
  INFO: 'bg-slate-600 text-slate-50',
};

interface EvidenceSource {
  scannerName: string;
  location?: string | null;
  evidenceJson?: string | null;
}
interface StatusEvent {
  id: string;
  fromStatus: string;
  toStatus: string;
  actor: string;
  note?: string | null;
  createdAt: string;
}
interface Detail {
  id: string;
  title: string;
  severity: string;
  status: string;
  riskScore: number;
  assetId: string;
  assetValue: string;
  cveId?: string | null;
  cvssScore?: number | null;
  cvssVector?: string | null;
  sources: string[];
  evidence: EvidenceSource[];
  note?: string | null;
  remediation?: string | null;
  statusHistory: StatusEvent[];
}

const STATUS_ACTIONS: { label: string; status: string }[] = [
  { label: 'Confirm', status: 'CONFIRMED' },
  { label: 'False-positive', status: 'FALSE_POSITIVE' },
  { label: 'Resolve', status: 'RESOLVED' },
  { label: 'Triage', status: 'TRIAGED' },
];

export function TriageDetail({
  id,
  onStatusChange,
}: {
  id: string | null;
  onStatusChange: (id: string, status: string) => void;
}) {
  const { data, loading, error } = useQuery<{ correlatedFinding: Detail }>(
    CORRELATED_FINDING_DETAIL_QUERY,
    { variables: { id }, skip: !id },
  );
  const [setNote] = useMutation(SET_FINDING_NOTE);
  const [setRemediation] = useMutation(SET_FINDING_REMEDIATION);

  const d = data?.correlatedFinding;
  const [noteDraft, setNoteDraft] = useState('');
  const [remDraft, setRemDraft] = useState('');

  useEffect(() => {
    setNoteDraft(d?.note ?? '');
    setRemDraft(d?.remediation ?? '');
  }, [d?.id, d?.note, d?.remediation]);

  if (!id) return <p className="p-6 text-slate-500 text-sm">Select a finding to triage.</p>;
  if (loading) return <p className="p-6 text-slate-400 text-sm">Loading…</p>;
  if (error)
    return (
      <p className="p-6 text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );
  if (!d) return null;

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
              SEVERITY_STYLE[d.severity] ?? SEVERITY_STYLE.INFO
            }`}
          >
            {d.severity}
          </span>
          <span className="font-mono text-xs text-slate-400">risk {d.riskScore}</span>
        </div>
        <h2 className="text-lg font-semibold">{d.title}</h2>
        {d.cveId ? (
          <p className="text-xs text-slate-400">
            <span className="font-mono">{d.cveId}</span>
            {d.cvssVector ? ` · ${d.cvssVector}` : ''}
          </p>
        ) : null}
      </header>

      <section className="text-sm">
        <h3 className="text-slate-400 text-xs uppercase mb-1">Affected asset</h3>
        <p className="font-mono">{d.assetValue}</p>
      </section>

      <section className="text-sm">
        <h3 className="text-slate-400 text-xs uppercase mb-1">Sources ({d.sources.join(', ')})</h3>
        <div className="space-y-2">
          {d.evidence.map((e, idx) => (
            <details key={idx} className="bg-slate-900 rounded p-2">
              <summary className="cursor-pointer text-xs text-slate-300">
                {e.scannerName}
                {e.location ? ` · ${e.location}` : ''}
              </summary>
              <pre className="mt-2 text-[11px] text-slate-400 whitespace-pre-wrap break-all">
                {e.evidenceJson ?? '—'}
              </pre>
            </details>
          ))}
        </div>
      </section>

      <section className="text-sm">
        <h3 className="text-slate-400 text-xs uppercase mb-1">Remediation</h3>
        <textarea
          aria-label="remediation"
          value={remDraft}
          onChange={(e) => setRemDraft(e.target.value)}
          onBlur={() => void setRemediation({ variables: { id: d.id, remediation: remDraft } })}
          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs"
          rows={3}
        />
      </section>

      <section className="text-sm">
        <h3 className="text-slate-400 text-xs uppercase mb-1">Triage note</h3>
        <textarea
          aria-label="triage-note"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => void setNote({ variables: { id: d.id, note: noteDraft } })}
          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs"
          rows={2}
        />
      </section>

      <section className="text-sm">
        <h3 className="text-slate-400 text-xs uppercase mb-1">Status history</h3>
        {d.statusHistory.length === 0 ? (
          <p className="text-xs text-slate-500">No changes yet.</p>
        ) : (
          <ul className="space-y-1">
            {d.statusHistory.map((e) => (
              <li key={e.id} className="text-xs text-slate-400">
                {e.fromStatus} → {e.toStatus} · {e.actor} ·{' '}
                {new Date(e.createdAt).toISOString().slice(0, 19).replace('T', ' ')}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
        {STATUS_ACTIONS.map((a) => (
          <button
            key={a.status}
            type="button"
            onClick={() => onStatusChange(d.id, a.status)}
            className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 border border-slate-700"
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
