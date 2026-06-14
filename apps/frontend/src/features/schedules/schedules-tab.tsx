import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client';

import {
  CREATE_SCHEDULE_MUTATION,
  DELETE_SCHEDULE_MUTATION,
  SCAN_TEMPLATES_QUERY,
  SCHEDULES_QUERY,
  UPDATE_SCHEDULE_MUTATION,
} from '../../lib/graphql/queries';
import { formatDate } from '../../lib/format-date';

interface ScanTemplateRow {
  id: string;
  name: string;
  displayName: string;
}

interface ScheduleRow {
  id: string;
  name: string;
  cronExpr: string;
  timezone: string;
  targets: string[];
  enabled: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  templateId: string;
  template?: { id: string; displayName: string } | null;
}

interface Props {
  engagementId: string;
}

export function SchedulesTab({ engagementId }: Props) {
  const { data, loading, error, refetch } = useQuery<{ schedules: ScheduleRow[] }>(
    SCHEDULES_QUERY,
    { variables: { engagementId } },
  );
  const { data: tmplData, loading: tmplLoading } = useQuery<{ scanTemplates: ScanTemplateRow[] }>(
    SCAN_TEMPLATES_QUERY,
  );

  const [createSchedule, { loading: creating, error: createError }] =
    useMutation(CREATE_SCHEDULE_MUTATION);
  const [updateSchedule, { error: updateError }] = useMutation(UPDATE_SCHEDULE_MUTATION);
  const [deleteSchedule, { error: deleteError }] = useMutation(DELETE_SCHEDULE_MUTATION);

  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [cronExpr, setCronExpr] = useState('0 2 * * *');
  const [timezone, setTimezone] = useState('UTC');
  const [targets, setTargets] = useState('');

  // Pre-select the first template once the list loads.
  useEffect(() => {
    if (!templateId && tmplData?.scanTemplates?.length) {
      setTemplateId(tmplData.scanTemplates[0].id);
    }
  }, [tmplData, templateId]);

  const parsedTargets = targets
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const submitDisabled =
    creating ||
    !templateId ||
    name.trim().length === 0 ||
    timezone.trim().length === 0 ||
    parsedTargets.length === 0;

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitDisabled) return;
    try {
      await createSchedule({
        variables: {
          input: { engagementId, templateId, name, cronExpr, timezone, targets: parsedTargets },
        },
      });
      setName('');
      setTargets('');
      await refetch();
    } catch {
      // surfaced via createError
    }
  }

  async function onToggle(s: ScheduleRow) {
    try {
      await updateSchedule({ variables: { id: s.id, input: { enabled: !s.enabled } } });
      await refetch();
    } catch {
      // surfaced via updateError
    }
  }

  async function onDelete(s: ScheduleRow) {
    try {
      await deleteSchedule({ variables: { id: s.id } });
      await refetch();
    } catch {
      // surfaced via deleteError
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onCreate}
        className="bg-slate-900 p-4 rounded grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
        aria-label="create-schedule"
      >
        <label className="md:col-span-2">
          <span className="block text-xs text-slate-300">Template</span>
          <select
            aria-label="Template"
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            disabled={tmplLoading || !tmplData?.scanTemplates?.length}
            required
          >
            {!templateId ? <option value="">— select —</option> : null}
            {tmplData?.scanTemplates?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="md:col-span-2">
          <span className="block text-xs text-slate-300">Name</span>
          <input
            aria-label="Name"
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nightly recon"
            required
          />
        </label>

        <label className="md:col-span-1">
          <span className="block text-xs text-slate-300">Cron</span>
          <input
            aria-label="Cron"
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={cronExpr}
            onChange={(e) => setCronExpr(e.target.value)}
            placeholder="0 2 * * *"
            required
          />
        </label>

        <label className="md:col-span-1">
          <span className="block text-xs text-slate-300">Timezone</span>
          <input
            aria-label="Timezone"
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="UTC"
            required
          />
        </label>

        <label className="md:col-span-5">
          <span className="block text-xs text-slate-300">Targets (comma-separated)</span>
          <input
            aria-label="Targets"
            className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
            placeholder="example.com, app.example.com"
            required
          />
        </label>

        <button
          type="submit"
          disabled={submitDisabled}
          className="md:col-span-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded py-2"
        >
          {creating ? 'Creating…' : 'Add schedule'}
        </button>

        {createError ? (
          <p className="md:col-span-6 text-sm text-red-400" role="alert">
            {createError.message}
          </p>
        ) : null}
      </form>

      {loading ? <p className="text-slate-400">Loading…</p> : null}
      {error ? (
        <p className="text-red-400" role="alert">
          {error.message}
        </p>
      ) : null}
      {updateError ? (
        <p className="text-red-400" role="alert">
          {updateError.message}
        </p>
      ) : null}
      {deleteError ? (
        <p className="text-red-400" role="alert">
          {deleteError.message}
        </p>
      ) : null}

      {data ? (
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-left">
            <tr>
              <th className="py-2">Name</th>
              <th>Template</th>
              <th>Cron</th>
              <th>Timezone</th>
              <th>Next run</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.schedules.map((s) => (
              <tr key={s.id} className="border-t border-slate-800">
                <td className="py-2">{s.name}</td>
                <td>{s.template?.displayName ?? s.templateId}</td>
                <td className="font-mono text-xs">{s.cronExpr}</td>
                <td>{s.timezone}</td>
                <td>{s.nextRunAt ? formatDate(s.nextRunAt) : '—'}</td>
                <td>{s.enabled ? 'Enabled' : 'Disabled'}</td>
                <td className="text-right space-x-3">
                  <button
                    type="button"
                    onClick={() => onToggle(s)}
                    aria-label={`${s.enabled ? 'Disable' : 'Enable'} schedule ${s.id}`}
                    className="text-indigo-400 hover:underline"
                  >
                    {s.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(s)}
                    aria-label={`Delete schedule ${s.id}`}
                    className="text-red-400 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {data.schedules.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  No schedules yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
