import { useMutation } from '@apollo/client';
import { Panel } from '../../components/ui/panel';
import { LiveLogsPane } from '../scans/live-logs-pane';
import { CANCEL_SCAN_MUTATION, RETRY_SCAN_MUTATION } from '../../lib/graphql/queries';

export interface CockpitFocus {
  scanId: string;
  jobId: string;
  scannerName: string;
  target: string;
}

export function ScannerFocusPanel({ focus }: { focus: CockpitFocus | null }) {
  const [cancelScan, { loading: cancelling }] = useMutation(CANCEL_SCAN_MUTATION);
  const [retryScan, { loading: retrying }] = useMutation(RETRY_SCAN_MUTATION);

  if (!focus) {
    return (
      <Panel aria-label="focus-empty" className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-500">
          Sélectionne un scanner à gauche pour voir ses logs.
        </p>
      </Panel>
    );
  }

  return (
    <Panel aria-label="scanner-focus" className="flex h-full flex-col gap-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-100">{focus.scannerName}</span>
          <span className="font-mono text-xs text-slate-400">{focus.target}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={cancelling}
            onClick={() => void cancelScan({ variables: { id: focus.scanId } })}
            className="rounded bg-rose-700/80 px-2 py-1 text-xs text-rose-50 hover:bg-rose-600 disabled:opacity-50"
          >
            Stop
          </button>
          <button
            type="button"
            disabled={retrying}
            onClick={() => void retryScan({ variables: { id: focus.scanId } })}
            className="rounded bg-space-800 px-2 py-1 text-xs text-slate-200 hover:bg-space-800/70 disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <LiveLogsPane scanJobId={focus.jobId} />
      </div>
    </Panel>
  );
}
