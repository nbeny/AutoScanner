import { useQuery } from '@apollo/client';
import { ENGAGEMENTS_QUERY } from '../../lib/graphql/queries';
import { useScope } from '../../lib/scope-context';

interface Engagement {
  id: string;
  name: string;
}

interface EngagementsData {
  engagements: Engagement[];
}

export function ScopeSelector() {
  const { engagementId, setScope } = useScope();
  const { data } = useQuery<EngagementsData>(ENGAGEMENTS_QUERY);
  const engagements = data?.engagements ?? [];

  return (
    <label className="flex items-center gap-2 text-sm text-slate-300">
      <span className="text-xs uppercase tracking-wide text-slate-500">Scope</span>
      <select
        aria-label="scope-selector"
        value={engagementId ?? ''}
        onChange={(e) => setScope(e.target.value || null)}
        className="rounded-md border border-space-800 bg-space-900 px-2 py-1 text-slate-100"
      >
        <option value="">Tous les périmètres</option>
        {engagements.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
    </label>
  );
}
