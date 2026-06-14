import { ApiKeysPanel } from './api-keys-panel';
import { NotificationsPanel } from '../notifications/notifications-panel';

export function SettingsPage() {
  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <ApiKeysPanel />
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Notification channels</h2>
        <NotificationsPanel />
      </div>
    </div>
  );
}
