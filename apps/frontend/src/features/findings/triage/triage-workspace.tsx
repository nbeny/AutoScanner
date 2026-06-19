import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import {
  CORRELATED_FINDINGS_QUERY,
  CORRELATED_FINDING_DETAIL_QUERY,
  SET_FINDING_STATUS,
} from '../../../lib/graphql/queries';
import { TriageQueue, type QueueItem } from './triage-queue';
import { TriageDetail } from './triage-detail';
import { useTriageKeyboard } from './use-triage-keyboard';

const ACTIVE_STATUSES = new Set(['OPEN', 'TRIAGED']);
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

export function TriageWorkspace({ engagementId }: { engagementId: string }) {
  const { data, loading, error } = useQuery<{ correlatedFindings: QueueItem[] }>(
    CORRELATED_FINDINGS_QUERY,
    { variables: { engagementId } },
  );
  const allItems = useMemo(() => data?.correlatedFindings ?? [], [data]);

  // Default filter (spec §2): show only the remaining work (OPEN + TRIAGED), with a
  // severity filter and a toggle to reveal every status. Filtering is client-side —
  // at single-operator scale the queue is already fully loaded.
  const [showAll, setShowAll] = useState(false);
  const [severity, setSeverity] = useState('ALL');
  const items = useMemo(
    () =>
      allItems
        .filter((i) => (showAll ? true : ACTIVE_STATUSES.has(i.status)))
        .filter((i) => severity === 'ALL' || i.severity === severity),
    [allItems, showAll, severity],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (items.length === 0) {
      if (selectedId) setSelectedId(null);
      return;
    }
    if (!selectedId || !items.some((i) => i.id === selectedId)) setSelectedId(items[0].id);
  }, [items, selectedId]);

  const [setStatus] = useMutation(SET_FINDING_STATUS);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const selectedIndex = items.findIndex((i) => i.id === selectedId);
  const move = (delta: number) => {
    if (items.length === 0) return;
    const next = Math.min(Math.max(selectedIndex + delta, 0), items.length - 1);
    setSelectedId(items[next].id);
  };

  const handleStatus = (id: string, status: string) => {
    void setStatus({
      variables: { id, status, note: null },
      refetchQueries: [
        { query: CORRELATED_FINDINGS_QUERY, variables: { engagementId } },
        { query: CORRELATED_FINDING_DETAIL_QUERY, variables: { id } },
      ],
    });
  };

  useTriageKeyboard({
    onNext: () => move(1),
    onPrev: () => move(-1),
    onStatus: (status) => {
      if (selectedId) handleStatus(selectedId, status);
    },
    onEditNote: () => noteRef.current?.focus(),
  });

  if (loading) return <p className="text-slate-400 text-sm">Loading triage queue…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );
  if (allItems.length === 0)
    return <p className="text-slate-500 text-sm">No findings to triage yet.</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <select
          aria-label="severity-filter"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 px-2 py-1"
        >
          <option value="ALL">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={showAll}
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-slate-300 px-2 py-1 rounded border border-slate-700 hover:border-slate-500 transition-colors"
        >
          Show all statuses
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-slate-500 text-sm">No findings to triage yet.</p>
      ) : (
        <div className="grid grid-cols-[minmax(260px,360px)_1fr] h-[70vh] border border-slate-800 rounded overflow-hidden">
          <TriageQueue items={items} selectedId={selectedId} onSelect={setSelectedId} />
          <TriageDetail
            id={selectedId}
            engagementId={engagementId}
            onStatusChange={handleStatus}
            noteRef={noteRef}
          />
        </div>
      )}
    </div>
  );
}
