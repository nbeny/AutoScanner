import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import {
  NOTIFICATION_CHANNELS_QUERY,
  CREATE_NOTIFICATION_CHANNEL_MUTATION,
  UPDATE_NOTIFICATION_CHANNEL_MUTATION,
  DELETE_NOTIFICATION_CHANNEL_MUTATION,
  TEST_NOTIFICATION_CHANNEL_MUTATION,
} from '../../lib/graphql/queries';

type NotificationChannelType = 'EMAIL' | 'SLACK' | 'DISCORD' | 'WEBHOOK';

const CHANNEL_TYPES: NotificationChannelType[] = ['EMAIL', 'SLACK', 'DISCORD', 'WEBHOOK'];

const EVENT_FILTERS = [
  'scan.completed',
  'scan.failed',
  'finding.critical',
  'report.ready',
  'schedule.finished',
] as const;

interface NotificationChannel {
  id: string;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  eventFilters: string[];
  createdAt: string;
  updatedAt: string;
}

export function NotificationsPanel() {
  const { data, loading, error, refetch } = useQuery<{
    notificationChannels: NotificationChannel[];
  }>(NOTIFICATION_CHANNELS_QUERY);

  const [createChannel, { loading: creating, error: createError }] = useMutation(
    CREATE_NOTIFICATION_CHANNEL_MUTATION,
  );
  const [updateChannel, { error: updateError }] = useMutation(UPDATE_NOTIFICATION_CHANNEL_MUTATION);
  const [deleteChannel, { error: deleteError }] = useMutation(DELETE_NOTIFICATION_CHANNEL_MUTATION);
  const [testChannel, { error: testError }] = useMutation(TEST_NOTIFICATION_CHANNEL_MUTATION);

  // Create form state
  const [name, setName] = useState('');
  const [type, setType] = useState<NotificationChannelType>('SLACK');
  const [eventFilters, setEventFilters] = useState<string[]>([]);

  // Config fields per type
  const [webhookUrl, setWebhookUrl] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [webhookEndpointUrl, setWebhookEndpointUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');

  function getConfigRequiredField(): string {
    switch (type) {
      case 'EMAIL':
        return emailTo;
      case 'SLACK':
      case 'DISCORD':
        return webhookUrl;
      case 'WEBHOOK':
        return webhookEndpointUrl;
    }
  }

  function buildConfig(): Record<string, string> {
    switch (type) {
      case 'EMAIL':
        return { to: emailTo };
      case 'SLACK':
      case 'DISCORD':
        return { webhookUrl };
      case 'WEBHOOK': {
        const cfg: Record<string, string> = { url: webhookEndpointUrl };
        if (webhookSecret) cfg['secret'] = webhookSecret;
        return cfg;
      }
    }
  }

  const submitDisabled =
    creating ||
    name.trim().length === 0 ||
    eventFilters.length === 0 ||
    getConfigRequiredField().trim().length === 0;

  function toggleFilter(filter: string) {
    setEventFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter],
    );
  }

  function resetForm() {
    setName('');
    setType('SLACK');
    setEventFilters([]);
    setWebhookUrl('');
    setEmailTo('');
    setWebhookEndpointUrl('');
    setWebhookSecret('');
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitDisabled) return;
    try {
      await createChannel({
        variables: {
          input: {
            name: name.trim(),
            type,
            eventFilters,
            config: buildConfig(),
          },
        },
      });
      resetForm();
      await refetch();
    } catch {
      // surfaced via createError
    }
  }

  async function onToggle(channel: NotificationChannel) {
    try {
      await updateChannel({
        variables: { id: channel.id, input: { enabled: !channel.enabled } },
      });
      await refetch();
    } catch {
      // surfaced via updateError
    }
  }

  async function onDelete(channel: NotificationChannel) {
    try {
      await deleteChannel({ variables: { id: channel.id } });
      await refetch();
    } catch {
      // surfaced via deleteError
    }
  }

  async function onTest(channel: NotificationChannel) {
    try {
      await testChannel({ variables: { id: channel.id } });
    } catch {
      // surfaced via testError
    }
  }

  const anyError = createError ?? updateError ?? deleteError ?? testError;

  return (
    <div className="space-y-6">
      {loading && <p className="text-slate-400 text-sm">Loading…</p>}
      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error.message}
        </p>
      )}
      {anyError && (
        <p className="text-red-400 text-sm" role="alert">
          {anyError.message}
        </p>
      )}

      {!loading && !error && (
        <div className="space-y-2">
          {(data?.notificationChannels ?? []).length === 0 ? (
            <p className="text-slate-500 text-sm">No notification channels configured.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-slate-400 text-left">
                <tr>
                  <th className="py-2">Name</th>
                  <th>Type</th>
                  <th>Events</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data?.notificationChannels ?? []).map((ch) => (
                  <tr key={ch.id} className="border-t border-slate-800">
                    <td className="py-2">{ch.name}</td>
                    <td>{ch.type}</td>
                    <td className="text-xs text-slate-400">{ch.eventFilters.join(', ')}</td>
                    <td>{ch.enabled ? 'Enabled' : 'Disabled'}</td>
                    <td className="text-right space-x-3">
                      <button
                        type="button"
                        onClick={() => onToggle(ch)}
                        aria-label={`${ch.enabled ? 'Disable' : 'Enable'} channel ${ch.id}`}
                        className="text-indigo-400 hover:underline"
                      >
                        {ch.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onTest(ch)}
                        aria-label={`Test channel ${ch.id}`}
                        className="text-slate-400 hover:underline"
                      >
                        Send test
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(ch)}
                        aria-label={`Delete channel ${ch.id}`}
                        className="text-red-400 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <form
        onSubmit={onCreate}
        className="space-y-4 border border-slate-800 rounded p-4"
        aria-label="create-notification-channel"
      >
        <h3 className="text-sm font-medium text-slate-300">Add notification channel</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="channel-name" className="text-xs text-slate-400">
              Name
            </label>
            <input
              id="channel-name"
              aria-label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ops-slack"
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="channel-type" className="text-xs text-slate-400">
              Type
            </label>
            <select
              id="channel-type"
              aria-label="Type"
              value={type}
              onChange={(e) => {
                setType(e.target.value as NotificationChannelType);
                setWebhookUrl('');
                setEmailTo('');
                setWebhookEndpointUrl('');
                setWebhookSecret('');
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
            >
              {CHANNEL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-slate-400">Event filters (select at least one)</span>
          <div className="flex flex-wrap gap-3">
            {EVENT_FILTERS.map((filter) => (
              <label key={filter} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  aria-label={filter}
                  checked={eventFilters.includes(filter)}
                  onChange={() => toggleFilter(filter)}
                  className="accent-indigo-500"
                />
                {filter}
              </label>
            ))}
          </div>
        </div>

        {/* Config fields that adapt to selected type */}
        {(type === 'SLACK' || type === 'DISCORD') && (
          <div className="space-y-1">
            <label htmlFor="channel-webhook-url" className="text-xs text-slate-400">
              Webhook URL
            </label>
            <input
              id="channel-webhook-url"
              aria-label="Webhook URL"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/..."
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
            />
          </div>
        )}

        {type === 'EMAIL' && (
          <div className="space-y-1">
            <label htmlFor="channel-email-to" className="text-xs text-slate-400">
              To (email)
            </label>
            <input
              id="channel-email-to"
              aria-label="To (email)"
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="ops@example.com"
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
            />
          </div>
        )}

        {type === 'WEBHOOK' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="channel-webhook-endpoint-url" className="text-xs text-slate-400">
                URL
              </label>
              <input
                id="channel-webhook-endpoint-url"
                aria-label="URL"
                value={webhookEndpointUrl}
                onChange={(e) => setWebhookEndpointUrl(e.target.value)}
                placeholder="https://your-endpoint.example.com/hook"
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="channel-webhook-secret" className="text-xs text-slate-400">
                Secret (optional)
              </label>
              <input
                id="channel-webhook-secret"
                aria-label="Secret (optional)"
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="optional signing secret"
                autoComplete="new-password"
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitDisabled}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm"
        >
          {creating ? 'Adding…' : 'Add channel'}
        </button>

        {createError && (
          <p className="text-sm text-red-400" role="alert">
            {createError.message}
          </p>
        )}
      </form>
    </div>
  );
}
