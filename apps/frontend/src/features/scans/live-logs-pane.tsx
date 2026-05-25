import { useEffect, useRef, useState } from 'react';
import { useSubscription } from '@apollo/client';
import { SCAN_JOB_LOGS_SUBSCRIPTION } from '../../lib/graphql/queries';

interface LogChunk {
  scanJobId: string;
  stream: 'STDOUT' | 'STDERR';
  ts: number;
  chunk: string;
}

export function LiveLogsPane({ scanJobId }: { scanJobId: string | null }) {
  const [lines, setLines] = useState<LogChunk[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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
  }, [lines]);

  if (!scanJobId) return <p className="text-slate-500 text-sm">Run a scan to see live logs.</p>;

  return (
    <div className="bg-black/60 rounded p-3 h-72 overflow-auto font-mono text-xs">
      {lines.map((l, i) => (
        <div key={i} className={l.stream === 'STDERR' ? 'text-red-300' : 'text-slate-200'}>
          {l.chunk}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
