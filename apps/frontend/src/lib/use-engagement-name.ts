import { useQuery } from '@apollo/client';
import { ENGAGEMENTS_QUERY } from './graphql/queries';

interface Engagement {
  id: string;
  name: string;
}

/**
 * Resolves an engagement id to its human name (for scope badges/headers).
 * Returns null while loading, when no scope is set, or if the id is unknown —
 * callers fall back to a truncated id.
 */
export function useEngagementName(engagementId?: string): string | null {
  const { data } = useQuery<{ engagements: Engagement[] }>(ENGAGEMENTS_QUERY, {
    skip: !engagementId,
  });
  if (!engagementId) return null;
  return data?.engagements.find((e) => e.id === engagementId)?.name ?? null;
}
