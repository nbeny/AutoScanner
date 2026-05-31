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
  domains: number;
  subdomains: number;
  ipAddresses: number;
  openPorts: number;
  uniqueTechs: number;
  findingsBySeverity: SeverityCounts;
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-900 rounded p-3 text-center min-w-[6rem]">
      <div className="text-2xl font-semibold text-slate-100">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}

export function AttackSurfaceCounters({ engagementId }: { engagementId: string }) {
  const { data, loading, error } = useQuery<{ engagementOverview: Overview }>(
    ENGAGEMENT_OVERVIEW_QUERY,
    { variables: { engagementId } },
  );

  if (loading) return <p className="text-slate-400 text-sm">Loading overview…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const o = data?.engagementOverview;
  if (!o) return null;

  return (
    <div className="flex flex-wrap gap-2" aria-label="attack-surface-counters">
      <Tile label="Domains" value={o.domains} />
      <Tile label="Subdomains" value={o.subdomains} />
      <Tile label="IPs" value={o.ipAddresses} />
      <Tile label="Open ports" value={o.openPorts} />
      <Tile label="Unique techs" value={o.uniqueTechs} />
    </div>
  );
}
