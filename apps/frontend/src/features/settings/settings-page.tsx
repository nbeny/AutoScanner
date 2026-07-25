import { ApiKeysPanel } from './api-keys-panel';
import { CloudCredentialsPanel } from './cloud-credentials-panel';
import { NotificationsPanel } from '../notifications/notifications-panel';
import { AgentsPanel } from '../agents/agents-panel';
import { SchedulesTab } from '../schedules/schedules-tab';
import { useScope } from '../../lib/scope-context';

function SchedulesSection() {
  const { engagementId } = useScope();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Planification</h2>
      {engagementId ? (
        <SchedulesTab engagementId={engagementId} />
      ) : (
        <p aria-label="schedules-no-scope" className="text-sm text-slate-400">
          Sélectionne un périmètre dans la barre du haut pour gérer ses planifications.
        </p>
      )}
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <ApiKeysPanel />
      <CloudCredentialsPanel />
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Notification channels</h2>
        <NotificationsPanel />
      </div>
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Distributed agents</h2>
        <AgentsPanel />
      </div>
      <SchedulesSection />
    </div>
  );
}
