import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import {
  ASSETS_BY_TYPE_QUERY,
  ASSET_TECHNOLOGIES_QUERY,
  UNIFIED_ASSETS_SCORED_QUERY,
} from '../../lib/graphql/queries';
import { EngagementAssetsFacets, type AssetFiltersState } from './engagement-assets-facets';
import { formatDate } from '../../lib/format-date';

export type AssetKind = 'DOMAIN' | 'SUBDOMAIN' | 'IP' | 'TECHNOLOGY';

interface TechnologyRow {
  id: string;
  name: string;
  version?: string | null;
}

interface LeanAssetRow {
  id: string;
  value: string;
  type: string;
  lastSeenAt: string;
}

interface TechnologyAssetRow {
  id: string;
  technologies?: TechnologyRow[] | null;
}

const KIND_TO_TYPE: Record<Exclude<AssetKind, 'TECHNOLOGY'>, string> = {
  DOMAIN: 'DOMAIN',
  SUBDOMAIN: 'SUBDOMAIN',
  IP: 'IP_ADDRESS',
};

const KIND_LABEL: Record<AssetKind, string> = {
  DOMAIN: 'Domains',
  SUBDOMAIN: 'Subdomains',
  IP: 'IPs',
  TECHNOLOGY: 'Technologies',
};

function TechnologiesPanel({ engagementId }: { engagementId: string }) {
  const { data, loading, error, refetch } = useQuery<{ assets: TechnologyAssetRow[] }>(
    ASSET_TECHNOLOGIES_QUERY,
    { variables: { engagementId } },
  );

  if (loading) return <p className="text-slate-400 text-sm">Loading technologies…</p>;
  if (error)
    return (
      <p className="text-red-400" role="alert">
        {error.message}
      </p>
    );

  const assets = data?.assets ?? [];
  const map = new Map<string, TechnologyRow>();
  for (const a of assets) {
    for (const t of a.technologies ?? []) {
      const key = `${t.name}@${t.version ?? ''}`;
      if (!map.has(key)) map.set(key, t);
    }
  }
  const techs = Array.from(map.values());

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Technologies ({techs.length})</h3>
        <button
          onClick={() => refetch()}
          className="text-xs text-indigo-400 hover:underline"
          type="button"
        >
          Refresh
        </button>
      </div>
      {techs.length === 0 ? (
        <p className="text-slate-500 text-sm">No technologies yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-left">
            <tr>
              <th className="py-2">Name</th>
              <th>Version</th>
            </tr>
          </thead>
          <tbody>
            {techs.map((t) => (
              <tr key={t.id} className="border-t border-slate-800">
                <td className="py-2 font-mono">{t.name}</td>
                <td className="font-mono text-xs">{t.version ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AssetsByTypePanel({
  engagementId,
  kind,
}: {
  engagementId: string;
  kind: Exclude<AssetKind, 'TECHNOLOGY'>;
}) {
  const targetType = KIND_TO_TYPE[kind];
  const { data, loading, error, refetch } = useQuery<{ assets: LeanAssetRow[] }>(
    ASSETS_BY_TYPE_QUERY,
    { variables: { engagementId, types: [targetType] } },
  );

  if (loading)
    return <p className="text-slate-400 text-sm">Loading {KIND_LABEL[kind].toLowerCase()}…</p>;
  if (error)
    return (
      <p className="text-red-400" role="alert">
        {error.message}
      </p>
    );

  const assets = data?.assets ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {KIND_LABEL[kind]} ({assets.length})
        </h3>
        <button
          onClick={() => refetch()}
          className="text-xs text-indigo-400 hover:underline"
          type="button"
        >
          Refresh
        </button>
      </div>
      {assets.length === 0 ? (
        <p className="text-slate-500 text-sm">No {KIND_LABEL[kind].toLowerCase()} yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-left">
            <tr>
              <th className="py-2">Value</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} className="border-t border-slate-800">
                <td className="py-2 font-mono">{a.value}</td>
                <td className="text-xs text-slate-400">{formatDate(a.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function EngagementAssetsTab({
  engagementId,
  kind,
}: {
  engagementId: string;
  kind: AssetKind;
}) {
  if (kind === 'TECHNOLOGY') return <TechnologiesPanel engagementId={engagementId} />;
  return <AssetsByTypePanel engagementId={engagementId} kind={kind} />;
}

type AssetSort = 'RISK_SCORE' | 'FIRST_SEEN_AT' | 'LAST_SEEN_AT' | 'CANONICAL_VALUE';

interface ScoredRow {
  id: string;
  kind: string;
  canonicalValue: string;
  displayName: string;
  firstSeenAt: string;
  lastSeenAt: string;
  riskScore: number;
}

export function ScoredAssetsPanel({ engagementId }: { engagementId: string }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<AssetSort>('RISK_SCORE');
  const [filters, setFilters] = useState<AssetFiltersState>({
    severityHas: [],
    techNames: [],
    scannerSources: [],
  });

  const { data, loading, error } = useQuery<{ unifiedAssets: ScoredRow[] }>(
    UNIFIED_ASSETS_SCORED_QUERY,
    {
      variables: {
        engagementId,
        sort,
        filters: {
          severityHas: filters.severityHas.length ? filters.severityHas : null,
          techNames: filters.techNames.length ? filters.techNames : null,
          scannerSources: filters.scannerSources.length ? filters.scannerSources : null,
        },
      },
    },
  );

  return (
    <div className="flex gap-6">
      <EngagementAssetsFacets engagementId={engagementId} state={filters} onChange={setFilters} />
      <div className="flex-1">
        {loading ? <p className="text-slate-400 text-sm">Loading…</p> : null}
        {error ? (
          <p className="text-red-400 text-sm" role="alert">
            {error.message}
          </p>
        ) : null}
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-2">Kind</th>
              <th>Value</th>
              <th
                onClick={() => setSort('RISK_SCORE')}
                className="cursor-pointer"
                aria-sort={sort === 'RISK_SCORE' ? 'descending' : 'none'}
              >
                Risk
              </th>
              <th onClick={() => setSort('LAST_SEEN_AT')} className="cursor-pointer">
                Last seen
              </th>
            </tr>
          </thead>
          <tbody>
            {(data?.unifiedAssets ?? []).map((r) => (
              <tr
                key={r.id}
                onClick={() => navigate(`/engagements/${engagementId}/assets/${r.id}`)}
                className="border-t border-slate-800 hover:bg-slate-900 cursor-pointer"
              >
                <td className="py-2 text-[10px] uppercase">{r.kind}</td>
                <td className="font-mono">{r.canonicalValue}</td>
                <td className="font-mono">{r.riskScore.toFixed(1)}</td>
                <td className="text-xs text-slate-400">{r.lastSeenAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
