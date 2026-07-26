import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { HealthPill, type HealthPillData } from './health-pill';
import { RUN_SCAN_MUTATION, CANCEL_ALL_SCANS_MUTATION } from '../../lib/graphql/queries';

export interface CockpitCommandBarProps {
  engagementId?: string;
  pills: HealthPillData[];
  onLaunched?: () => void;
}

/** Common recon scanners surfaced in the quick-launch selector. */
export const RECON_SCANNERS = [
  'nmap',
  'naabu',
  'rustscan',
  'masscan',
  'httpx',
  'whatweb',
  'nuclei',
  'ffuf',
  'katana',
  'subfinder',
] as const;

export function CockpitCommandBar({ engagementId, pills, onLaunched }: CockpitCommandBarProps) {
  const [target, setTarget] = useState('');
  const [scanner, setScanner] = useState('nmap');
  const [armed, setArmed] = useState(false);

  const [runScan, { loading: launching }] = useMutation(RUN_SCAN_MUTATION);
  const [cancelAll, { loading: killing }] = useMutation(CANCEL_ALL_SCANS_MUTATION);

  const scoped = Boolean(engagementId);

  async function launch() {
    if (!engagementId || !target) return;
    await runScan({
      variables: { input: { engagementId, scannerName: scanner, target, optionsJson: '' } },
    });
    setTarget('');
    onLaunched?.();
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
      aria-label="cockpit-command-bar"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-space-800 bg-space-900/60 px-4 py-3"
    >
      <input
        aria-label="quick-target"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder="IP / domaine / URL"
        className="w-56 rounded-md border border-space-800 bg-space-900 px-2 py-1 text-sm text-slate-100"
      />
      <select
        aria-label="quick-scanner"
        value={scanner}
        onChange={(e) => setScanner(e.target.value)}
        className="w-32 rounded-md border border-space-800 bg-space-900 px-2 py-1 text-sm text-slate-100"
      >
        {RECON_SCANNERS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => void launch()}
        disabled={!scoped || !target || launching}
        className="rounded-md bg-neon-cyan/20 px-3 py-1 text-sm text-neon-cyan hover:bg-neon-cyan/30 disabled:opacity-40"
      >
        Run
      </button>

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
