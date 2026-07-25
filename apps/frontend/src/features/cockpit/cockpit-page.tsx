import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { useScope } from '../../lib/scope-context';
import { QUEUE_HEALTH_QUERY } from '../../lib/graphql/queries';
import { ScansList } from '../scans/scans-list';
import { ActiveScannersList } from './active-scanners-list';
import { ScannerFocusPanel, type CockpitFocus } from './scanner-focus-panel';
import { QueuesWorkersPanel } from './queues-workers-panel';
import { SeveritySparklinePanel } from './severity-sparkline-panel';
import { FindingsFluxFeed } from './findings-flux-feed';
import { CockpitCommandBar } from './cockpit-command-bar';
import type { HealthPillData } from './health-pill';
import { useActiveScanners } from './use-active-scanners';

interface QueueHealth {
  name: string;
  waiting: number;
  active: number;
  workers: number;
}

export function CockpitPage() {
  const { engagementId } = useScope();
  const scope = engagementId ?? undefined;
  const [focus, setFocus] = useState<CockpitFocus | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { active } = useActiveScanners(scope);
  const { data } = useQuery<{ queueHealth: QueueHealth[] }>(QUEUE_HEALTH_QUERY, {
    pollInterval: 4000,
    fetchPolicy: 'cache-and-network',
  });

  const totalWaiting = (data?.queueHealth ?? []).reduce((s, q) => s + q.waiting, 0);
  const totalWorkers = (data?.queueHealth ?? []).reduce((s, q) => s + q.workers, 0);
  const pills: HealthPillData[] = [
    { label: 'actifs', value: active.length, tone: 'cyan' },
    { label: 'en file', value: totalWaiting },
    { label: 'workers', value: totalWorkers },
  ];

  function selectJob(scanId: string, jobId: string) {
    const job = active.find((a) => a.jobId === jobId);
    setFocus(
      job
        ? { scanId, jobId, scannerName: job.scannerName, target: job.target }
        : { scanId, jobId, scannerName: 'scanner', target: '' },
    );
  }

  return (
    <div className="space-y-4 p-6">
      <CockpitCommandBar engagementId={scope} pills={pills} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(220px,1fr)_2fr_minmax(260px,1.2fr)]">
        <div className="min-h-[24rem]">
          <ActiveScannersList
            engagementId={scope}
            selectedJobId={focus?.jobId ?? null}
            onSelect={selectJob}
          />
        </div>
        <div className="min-h-[24rem]">
          <ScannerFocusPanel focus={focus} />
        </div>
        <div className="space-y-4">
          <QueuesWorkersPanel />
          <SeveritySparklinePanel engagementId={scope} />
          <FindingsFluxFeed engagementId={scope} />
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          {showHistory ? '▾ Masquer' : '▸ Afficher'} l&apos;historique des scans
        </button>
        {showHistory ? (
          <div className="mt-2">
            <ScansList engagementId={scope} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
