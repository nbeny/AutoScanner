import { useQuery } from '@apollo/client';
import { GLOBAL_OVERVIEW_QUERY } from '../../lib/graphql/queries';
import { SeverityDonutChart, type SeverityCounts } from '../../components/severity-donut-chart';

interface EngagementsByStatus {
  draft: number;
  active: number;
  paused: number;
  completed: number;
  archived: number;
  total: number;
}

interface GlobalOverview {
  engagementsByStatus: EngagementsByStatus;
  domains: number;
  subdomains: number;
  ipAddresses: number;
  openPorts: number;
  uniqueTechs: number;
  findingsBySeverity: SeverityCounts;
  activeSchedules: number;
  runningScans: number;
}

function Kpi({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="bg-slate-900 rounded p-4 min-w-[8rem] flex-1">
      <div className="text-3xl font-semibold text-slate-100">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
      {hint ? <div className="text-xs text-slate-500 mt-0.5">{hint}</div> : null}
    </div>
  );
}

function SurfaceTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-900 rounded p-3 text-center min-w-[6rem] flex-1">
      <div className="text-2xl font-semibold text-slate-100">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}

export function DashboardOverview() {
  const { data, loading, error } = useQuery<{ globalOverview: GlobalOverview }>(
    GLOBAL_OVERVIEW_QUERY,
  );

  if (loading) return <p className="text-slate-400 text-sm">Loading overview…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const o = data?.globalOverview;
  if (!o) return null;

  const sev = o.findingsBySeverity;
  const openFindings = sev.critical + sev.high + sev.medium + sev.low + sev.info;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3" aria-label="dashboard-kpis">
        <Kpi
          label="Engagements"
          value={o.engagementsByStatus.total}
          hint={`${o.engagementsByStatus.active} active`}
        />
        <Kpi label="Open findings" value={openFindings} />
        <Kpi label="Critical" value={sev.critical} />
        <Kpi label="High" value={sev.high} />
        <Kpi label="Active schedules" value={o.activeSchedules} />
        <Kpi label="Running scans" value={o.runningScans} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div aria-label="global-severity-container">
          <h3 className="text-lg font-semibold mb-3">Findings by severity</h3>
          <SeverityDonutChart counts={sev} />
        </div>
        <div aria-label="global-attack-surface-container">
          <h3 className="text-lg font-semibold mb-3">Attack surface</h3>
          <div className="flex flex-wrap gap-2" aria-label="global-attack-surface">
            <SurfaceTile label="Domains" value={o.domains} />
            <SurfaceTile label="Subdomains" value={o.subdomains} />
            <SurfaceTile label="IPs" value={o.ipAddresses} />
            <SurfaceTile label="Open ports" value={o.openPorts} />
            <SurfaceTile label="Unique techs" value={o.uniqueTechs} />
          </div>
        </div>
      </div>
    </div>
  );
}
