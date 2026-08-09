import { useEffect, useRef, useState } from 'react';
import { useQuery, useSubscription } from '@apollo/client';
import { SCAN_JOB_LOGS_SUBSCRIPTION, SCAN_JOB_LOG_HISTORY_QUERY } from '../../lib/graphql/queries';

interface LogChunk {
  scanJobId: string;
  stream: 'STDOUT' | 'STDERR';
  ts: number;
  chunk: string;
}

export function LiveLogsPane({ scanJobId }: { scanJobId: string | null }) {
  const [history, setHistory] = useState<string>('');
  const [lines, setLines] = useState<LogChunk[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // 1) Backfill : charge l'historique persisté à chaque changement de job.
  useQuery<{ scanJobLogHistory: string }>(SCAN_JOB_LOG_HISTORY_QUERY, {
    skip: !scanJobId,
    fetchPolicy: 'network-only',
    variables: scanJobId ? { scanJobId } : undefined,
    onCompleted: (data) => {
      setHistory(data.scanJobLogHistory ?? '');
      setLines([]); // repart propre : l'historique couvre déjà le passé
    },
  });

  // 2) Live : continue avec les chunks temps réel.
  useSubscription<{ scanJobLogs: LogChunk }>(SCAN_JOB_LOGS_SUBSCRIPTION, {
    skip: !scanJobId,
    variables: scanJobId ? { scanJobId } : undefined,
    onData: ({ data }) => {
      if (data.data?.scanJobLogs) {
        setLines((prev) => [...prev, data.data!.scanJobLogs]);
      }
    },
  });

  useEffect(() => {
    const el = bottomRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'auto' });
    }
  }, [lines, history]);

  if (!scanJobId) return <p className="text-slate-500 text-sm">Run a scan to see live logs.</p>;

  const empty = !history && lines.length === 0;

  return (
    <div className="bg-black/60 rounded p-3 h-72 overflow-auto font-mono text-xs">
      {empty && <p className="text-slate-500">No logs yet.</p>}
      {history && <pre className="whitespace-pre-wrap text-slate-300 m-0">{history}</pre>}
      {lines.map((l, i) => (
        <div key={i} className={l.stream === 'STDERR' ? 'text-red-300' : 'text-slate-200'}>
          {l.chunk}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
