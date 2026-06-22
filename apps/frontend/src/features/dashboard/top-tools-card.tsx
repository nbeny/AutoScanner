import { useQuery } from '@apollo/client';
import { TOOL_ACTIVITY_QUERY } from '../../lib/graphql/queries';

interface Props {
  engagementId?: string;
}

interface ToolActivity {
  scannerName: string;
  totalFindings: number;
}

export function TopToolsCard({ engagementId }: Props = {}) {
  const { data, loading, error } = useQuery(TOOL_ACTIVITY_QUERY, {
    variables: { engagementId: engagementId ?? null },
  });

  if (loading) return <p className="text-slate-400 text-sm">Chargement…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const all: ToolActivity[] = data?.toolActivity ?? [];
  const top8 = [...all].sort((a, b) => b.totalFindings - a.totalFindings).slice(0, 8);

  const maxFindings = top8[0]?.totalFindings ?? 1;

  return (
    <div aria-label="top-tools-card" className="bg-slate-900 rounded p-4">
      <h3 className="text-lg font-semibold mb-3">Top outils par findings</h3>
      {top8.length === 0 ? (
        <p className="text-slate-400 text-sm">Aucun outil actif.</p>
      ) : (
        <ul className="space-y-2">
          {top8.map((tool) => (
            <li key={tool.scannerName} className="flex items-center gap-2">
              <span className="text-sm text-slate-300 w-32 shrink-0 truncate">
                {tool.scannerName}
              </span>
              <div className="flex-1 bg-slate-800 rounded h-3 overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded"
                  style={{
                    width: `${Math.round((tool.totalFindings / maxFindings) * 100)}%`,
                  }}
                />
              </div>
              <span className="text-xs text-slate-400 w-8 text-right shrink-0">
                {tool.totalFindings}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
