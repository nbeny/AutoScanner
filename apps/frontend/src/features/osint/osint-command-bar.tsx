import { useMemo, useState } from 'react';
import { useMutation } from '@apollo/client';
import { HealthPill, type HealthPillData } from '../cockpit/health-pill';
import { RUN_OSINT_SCAN_MUTATION, CANCEL_ALL_SCANS_MUTATION } from '../../lib/graphql/queries';
import {
  detectSeedType,
  OSINT_SEED_TYPES,
  SEED_TYPE_LABEL,
  type OsintSeedType,
} from './detect-seed-type';

export interface OsintCommandBarProps {
  engagementId?: string;
  pills: HealthPillData[];
  onLaunched?: (result: { count: number; seed: string }) => void;
}

export function OsintCommandBar({ engagementId, pills, onLaunched }: OsintCommandBarProps) {
  const [seed, setSeed] = useState('');
  const [manualType, setManualType] = useState<OsintSeedType | null>(null);
  const [armed, setArmed] = useState(false);

  const [runOsint, { loading: launching }] = useMutation(RUN_OSINT_SCAN_MUTATION);
  const [cancelAll, { loading: killing }] = useMutation(CANCEL_ALL_SCANS_MUTATION);

  const scoped = Boolean(engagementId);
  const trimmed = seed.trim();
  const seedType = useMemo(() => manualType ?? detectSeedType(trimmed), [manualType, trimmed]);

  async function launch() {
    if (!engagementId || !trimmed) return;
    const res = await runOsint({
      variables: { input: { engagementId, seed: trimmed, seedType } },
    });
    const result = res.data?.runOsintScan;
    setSeed('');
    setManualType(null);
    if (result) onLaunched?.({ count: result.count, seed: result.seed });
  }

  async function killSwitch() {
    if (!engagementId) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    await cancelAll({ variables: { engagementId } });
    setArmed(false);
  }

  return (
    <div
      aria-label="osint-command-bar"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-space-800 bg-space-900/60 px-4 py-3"
    >
      <input
        aria-label="osint-seed"
        value={seed}
        onChange={(e) => setSeed(e.target.value)}
        placeholder="Email / username / nom / domaine"
        className="w-64 rounded-md border border-space-800 bg-space-900 px-2 py-1 text-sm text-slate-100"
      />
      <select
        aria-label="osint-seed-type"
        value={seedType}
        onChange={(e) => setManualType(e.target.value as OsintSeedType)}
        className="rounded-md border border-space-800 bg-space-900 px-2 py-1 text-sm text-slate-100"
      >
        {OSINT_SEED_TYPES.map((t) => (
          <option key={t} value={t}>
            {SEED_TYPE_LABEL[t]}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => void launch()}
        disabled={!scoped || !trimmed || launching}
        className="rounded-md bg-neon-magenta/20 px-3 py-1 text-sm text-neon-magenta hover:bg-neon-magenta/30 disabled:opacity-40"
      >
        Investiguer
      </button>
      {!scoped ? (
        <span className="text-xs text-slate-500">Sélectionne un périmètre pour investiguer.</span>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {pills.map((p) => (
          <HealthPill key={p.label} data={p} />
        ))}
        <button
          type="button"
          onClick={() => void killSwitch()}
          disabled={!scoped || killing}
          className={`rounded-md px-3 py-1 text-sm disabled:opacity-40 ${
            armed ? 'bg-rose-600 text-white' : 'bg-rose-900/50 text-rose-200 hover:bg-rose-800/60'
          }`}
        >
          {armed ? 'Confirmer kill' : 'Kill-switch'}
        </button>
      </div>
    </div>
  );
}
