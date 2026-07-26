import { useQuery } from '@apollo/client';
import { Panel } from '../../components/ui/panel';
import { ASSETS_QUERY, EMAILS_QUERY, IDENTITIES_QUERY } from '../../lib/graphql/queries';
import { buildOsintGraph } from './build-osint-graph';
import { OsintGraph } from './osint-graph';
import {
  emailMatchesFocus,
  focusDomain,
  identityMatchesFocus,
  type InvestigationFocus,
} from './seed-match';

interface IdentityRow {
  id: string;
  service: string;
  seed: string;
}
interface EmailRow {
  id: string;
  address: string;
}
interface AssetRow {
  id: string;
  value: string;
  type: string;
}

function assetMatchesFocus(focus: InvestigationFocus | null, asset: AssetRow): boolean {
  if (!focus) return true;
  const domain = focusDomain(focus);
  if (!domain) return false;
  const value = asset.value.trim().toLowerCase();
  return value === domain || value.endsWith(`.${domain}`);
}

export function OsintGraphPanel({
  engagementId,
  focus = null,
}: {
  engagementId?: string;
  focus?: InvestigationFocus | null;
}) {
  const skip = !engagementId;
  const identities = useQuery<{ identities: IdentityRow[] }>(IDENTITIES_QUERY, {
    variables: { engagementId, seed: undefined },
    skip,
    pollInterval: 5000,
    fetchPolicy: 'cache-and-network',
  });
  const emails = useQuery<{ emails: EmailRow[] }>(EMAILS_QUERY, {
    variables: { engagementId },
    skip,
    pollInterval: 5000,
    fetchPolicy: 'cache-and-network',
  });
  const assets = useQuery<{ assets: AssetRow[] }>(ASSETS_QUERY, {
    variables: { engagementId },
    skip,
    pollInterval: 5000,
    fetchPolicy: 'cache-and-network',
  });

  const identityRows = (identities.data?.identities ?? []).filter((i) =>
    identityMatchesFocus(focus, i),
  );
  const emailRows = (emails.data?.emails ?? []).filter((e) => emailMatchesFocus(focus, e));
  const assetRows = (assets.data?.assets ?? []).filter((a) => assetMatchesFocus(focus, a));
  const graph = buildOsintGraph(identityRows, emailRows, assetRows);

  return (
    <Panel aria-label="osint-graph-panel" className="space-y-2">
      <div className="flex items-center gap-3">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">
          Graphe identités ↔ assets
        </h2>
        <span className="flex items-center gap-3 text-[10px] text-slate-500">
          <Legend color="#e879f9" label="identité" />
          <Legend color="#22d3ee" label="email" />
          <Legend color="#10b981" label="asset" />
        </span>
      </div>
      {!engagementId ? (
        <p className="text-sm text-slate-500">Sélectionne un périmètre.</p>
      ) : (
        <OsintGraph graph={graph} />
      )}
    </Panel>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
