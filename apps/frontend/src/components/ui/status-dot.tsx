export type LiveStatus = 'RUNNING' | 'QUEUED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';

const DOT_COLOR: Record<LiveStatus, string> = {
  RUNNING: 'bg-neon-cyan shadow-glow-cyan',
  QUEUED: 'bg-slate-400',
  COMPLETED: 'bg-emerald-400',
  FAILED: 'bg-rose-500',
  CANCELLED: 'bg-amber-500',
  TIMEOUT: 'bg-orange-500',
};

export function StatusDot({ status }: { status: LiveStatus }) {
  return (
    <span
      role="status"
      aria-label={status}
      className={`inline-block h-2 w-2 rounded-full ${DOT_COLOR[status]}`}
    />
  );
}
