export interface HealthPillData {
  label: string;
  value: string | number;
  tone?: 'default' | 'cyan' | 'warn';
}

const TONE: Record<string, string> = {
  default: 'text-slate-300 border-space-800',
  cyan: 'text-neon-cyan border-neon-cyan/40',
  warn: 'text-rose-300 border-rose-500/40',
};

export function HealthPill({ data }: { data: HealthPillData }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs ${TONE[data.tone ?? 'default']}`}>
      <span className="font-mono font-semibold">{data.value}</span>{' '}
      <span className="text-slate-500">{data.label}</span>
    </span>
  );
}
