import { ApiKeysPanel } from './api-keys-panel';

export function SettingsPage() {
  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <ApiKeysPanel />
    </div>
  );
}
