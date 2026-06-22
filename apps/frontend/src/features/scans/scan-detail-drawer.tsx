import { Link } from 'react-router-dom';
import { ScanDetailBody } from './scan-detail-body';

export interface ScanDetailDrawerProps {
  scanId: string | null;
  onClose: () => void;
}

export function ScanDetailDrawer({ scanId, onClose }: ScanDetailDrawerProps) {
  if (!scanId) return null;

  return (
    <div
      aria-label="scan-detail-drawer"
      className="fixed inset-y-0 right-0 w-[640px] max-w-full bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col z-50 overflow-hidden"
    >
      {/* Drawer header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
        <Link
          to={`/scans/${scanId}`}
          className="text-indigo-400 hover:text-indigo-300 text-sm underline underline-offset-2"
        >
          Ouvrir en pleine page
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="close-drawer"
          className="text-slate-400 hover:text-slate-100 text-xl leading-none px-2"
        >
          ✕
        </button>
      </div>

      {/* Drawer body */}
      <div className="flex-1 overflow-y-auto p-4">
        <ScanDetailBody scanId={scanId} />
      </div>
    </div>
  );
}
