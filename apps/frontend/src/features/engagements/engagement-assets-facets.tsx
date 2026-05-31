import { useQuery } from '@apollo/client';
import { ASSET_FACETS_QUERY } from '../../lib/graphql/queries';

export interface AssetFiltersState {
  severityHas: string[];
  techNames: string[];
  scannerSources: string[];
}

interface FacetsData {
  assetFacets: {
    kindCounts: { kind: string; count: number }[];
    severityCounts: { severity: string; count: number }[];
    topTechs: { name: string; count: number }[];
    scannerSources: string[];
  };
}

export function EngagementAssetsFacets({
  engagementId,
  state,
  onChange,
}: {
  engagementId: string;
  state: AssetFiltersState;
  onChange: (next: AssetFiltersState) => void;
}) {
  const { data, loading } = useQuery<FacetsData>(ASSET_FACETS_QUERY, {
    variables: { engagementId },
  });

  if (loading) return <aside className="text-slate-400 text-sm">Loading facets…</aside>;
  const facets = data?.assetFacets;
  if (!facets) return null;

  const toggle = (key: keyof AssetFiltersState, value: string) => {
    const cur = state[key];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    onChange({ ...state, [key]: next });
  };

  return (
    <aside className="w-56 space-y-4 text-sm" aria-label="facets">
      <FacetGroup title="Severity">
        {facets.severityCounts.map((s) => (
          <FacetRow
            key={s.severity}
            label={s.severity}
            count={s.count}
            active={state.severityHas.includes(s.severity)}
            onClick={() => toggle('severityHas', s.severity)}
          />
        ))}
      </FacetGroup>
      <FacetGroup title="Top techs">
        {facets.topTechs.map((t) => (
          <FacetRow
            key={t.name}
            label={t.name}
            count={t.count}
            active={state.techNames.includes(t.name)}
            onClick={() => toggle('techNames', t.name)}
          />
        ))}
      </FacetGroup>
      <FacetGroup title="Scanners">
        {facets.scannerSources.map((s) => (
          <FacetRow
            key={s}
            label={s}
            count={null}
            active={state.scannerSources.includes(s)}
            onClick={() => toggle('scannerSources', s)}
          />
        ))}
      </FacetGroup>
    </aside>
  );
}

function FacetGroup(props: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs uppercase text-slate-500 mb-1">{props.title}</h4>
      <div className="space-y-1">{props.children}</div>
    </div>
  );
}

function FacetRow(props: {
  label: string;
  count: number | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={
        'w-full flex justify-between px-2 py-1 rounded ' +
        (props.active ? 'bg-indigo-700 text-white' : 'hover:bg-slate-800 text-slate-300')
      }
    >
      <span>{props.label}</span>
      {props.count !== null ? <span className="text-slate-400">{props.count}</span> : null}
    </button>
  );
}
