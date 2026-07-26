import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { useScope } from '../../lib/scope-context';
import { QUEUE_HEALTH_QUERY } from '../../lib/graphql/queries';
import { ActiveScannersList } from '../cockpit/active-scanners-list';
import { QueuesWorkersPanel, type QueueHealth } from '../cockpit/queues-workers-panel';
import { FindingsFluxFeed } from '../cockpit/findings-flux-feed';
import { useActiveScanners } from '../cockpit/use-active-scanners';
import type { HealthPillData } from '../cockpit/health-pill';
import { OsintCommandBar } from './osint-command-bar';
import { IdentitiesPanel } from './identities-panel';
import { EmailsPanel } from './emails-panel';
import { SpoofabilityPanel } from './spoofability-panel';

export function OsintCockpitPage() {
  const { engagementId } = useScope();
  const scope = engagementId ?? undefined;
  const [flash, setFlash] = useState<string | null>(null);

  const { active } = useActiveScanners(scope);
  const { data } = useQuery<{ queueHealth: QueueHealth[] }>(QUEUE_HEALTH_QUERY, {
    pollInterval: 4000,
    fetchPolicy: 'cache-and-network',
  });

  const totalWaiting = (data?.queueHealth ?? []).reduce((s, q) => s + q.waiting, 0);
  const pills: HealthPillData[] = [
    { label: 'actifs', value: active.length, tone: 'cyan' },
    { label: 'en file', value: totalWaiting },
  ];

  return (
    <div className="space-y-4 p-6">
      <header className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold text-neon-magenta">Cockpit OSINT</h1>
        <p className="text-xs text-slate-500">
          Investigation par email · username · personne · domaine
        </p>
      </header>

      <OsintCommandBar
        engagementId={scope}
        pills={pills}
        onLaunched={({ count, seed }) =>
          setFlash(
            `${count} scanner${count > 1 ? 's' : ''} lancé${count > 1 ? 's' : ''} sur « ${seed} »`,
          )
        }
      />
      {flash ? (
        <p role="status" className="text-xs text-neon-magenta">
          {flash}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(220px,1fr)_2fr_minmax(260px,1.2fr)]">
        <div className="min-h-[24rem]">
          <ActiveScannersList
            engagementId={scope}
            selectedJobId={null}
            onSelect={() => undefined}
          />
        </div>
        <div className="space-y-4">
          <IdentitiesPanel engagementId={scope} />
          <EmailsPanel engagementId={scope} />
        </div>
        <div className="space-y-4">
          <SpoofabilityPanel engagementId={scope} />
          <FindingsFluxFeed engagementId={scope} />
          <QueuesWorkersPanel queues={data?.queueHealth ?? []} />
        </div>
      </div>
    </div>
  );
}
