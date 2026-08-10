import { useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { ENGAGEMENTS_QUERY } from './graphql/queries';
import { useScope } from './scope-context';

export interface ScopeEngagement {
  id: string;
  name: string;
}

interface EngagementsData {
  engagements: ScopeEngagement[];
}

/**
 * Single-operator platform: there is exactly one engagement ("périmètre"), so we
 * never make the operator pick one. This hook auto-selects the sole engagement
 * (and repairs a stale stored id that no longer resolves) so every scope-gated
 * page and panel just works, without a manual selection. Returns the active
 * engagement so the shell can display its name as read-only context.
 */
export function useEnsureScope(): { engagement: ScopeEngagement | null; loading: boolean } {
  const { engagementId, setScope } = useScope();
  const { data, loading } = useQuery<EngagementsData>(ENGAGEMENTS_QUERY);

  useEffect(() => {
    const list = data?.engagements ?? [];
    if (list.length === 0) return;
    const valid = engagementId != null && list.some((e) => e.id === engagementId);
    if (!valid) setScope(list[0].id);
  }, [data, engagementId, setScope]);

  const engagement = data?.engagements.find((e) => e.id === engagementId) ?? null;
  return { engagement, loading };
}
