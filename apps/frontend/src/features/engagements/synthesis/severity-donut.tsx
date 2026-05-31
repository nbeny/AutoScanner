import { useQuery } from '@apollo/client';
import { ENGAGEMENT_OVERVIEW_QUERY } from '../../../lib/graphql/queries';

interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

interface Overview {
  findingsBySeverity: SeverityCounts;
}

type SeverityKey = keyof SeverityCounts;

const COLORS: Record<SeverityKey, string> = {
  critical: '#b91c1c',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
  info: '#475569',
};

const ORDER: SeverityKey[] = ['critical', 'high', 'medium', 'low', 'info'];

const R = 45;
const STROKE = 15;

function polar(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

export function SeverityDonut({ engagementId }: { engagementId: string }) {
  const { data, loading, error } = useQuery<{ engagementOverview: Overview }>(
    ENGAGEMENT_OVERVIEW_QUERY,
    { variables: { engagementId } },
  );

  if (loading) return <p className="text-slate-400 text-sm">Loading severity…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const c = data?.engagementOverview.findingsBySeverity;
  if (!c) return null;

  const total = c.critical + c.high + c.medium + c.low + c.info;
  if (total === 0) {
    return (
      <div className="bg-slate-900 rounded p-4 text-center text-sm text-slate-400">
        No findings yet.
      </div>
    );
  }

  let angle = -Math.PI / 2;
  const arcs = ORDER.filter((k) => c[k] > 0).map((k) => {
    const value = c[k];
    const frac = value / total;
    const start = angle;
    const end = angle + frac * 2 * Math.PI;
    angle = end;

    const largeArc = end - start > Math.PI ? 1 : 0;
    const p0 = polar(50, 50, R, start);
    const p1 = polar(50, 50, R, end);

    const d =
      frac === 1
        ? `M ${50 - R} 50 A ${R} ${R} 0 1 1 ${50 + R} 50 A ${R} ${R} 0 1 1 ${50 - R} 50`
        : `M ${p0.x} ${p0.y} A ${R} ${R} 0 ${largeArc} 1 ${p1.x} ${p1.y}`;

    return { key: k, value, d };
  });

  return (
    <div className="bg-slate-900 rounded p-4 flex items-center gap-4" aria-label="severity-donut">
      <svg
        viewBox="0 0 100 100"
        className="w-32 h-32"
        role="img"
        aria-label="findings severity distribution"
      >
        {arcs.map((a) => (
          <path
            key={a.key}
            d={a.d}
            stroke={COLORS[a.key]}
            strokeWidth={STROKE}
            fill="none"
            aria-label={`arc-${a.key}-${a.value}`}
          />
        ))}
        <text
          x="50"
          y="54"
          textAnchor="middle"
          fontSize="18"
          fill="#e2e8f0"
          aria-label="total-findings"
        >
          {total}
        </text>
      </svg>
      <ul className="text-xs space-y-1">
        {ORDER.map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: COLORS[k] }}
              aria-hidden="true"
            />
            <span className="uppercase text-slate-300 w-20">{k}</span>
            <span className="font-mono text-slate-100">{c[k]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
