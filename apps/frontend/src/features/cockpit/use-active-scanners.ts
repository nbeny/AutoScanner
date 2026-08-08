import { useQuery } from '@apollo/client';
import { ALL_SCANS_QUERY } from '../../lib/graphql/queries';

export interface CockpitJob {
  scanId: string;
  jobId: string;
  scannerName: string;
  target: string;
  status: 'RUNNING' | 'QUEUED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
  startedAt: string | null;
}

interface RawJob {
  id: string;
  scannerName: string;
  target: string;
  status: CockpitJob['status'];
  startedAt: string | null;
}
interface RawScan {
  id: string;
  status: string;
  jobs: RawJob[];
}

/**
 * Cockpit scanner list. `statuses` filters both the scan-level query (server-side
 * `statusIn`, so history isn't over-fetched) and the job-level rows shown. Pass an
 * empty array to show every status ("Tous"). Defaults to the active set
 * (RUNNING/QUEUED) so callers that just want the live count (e.g. the header pill)
 * keep their previous behaviour.
 */
export function useActiveScanners(
  engagementId?: string,
  statuses: string[] = ['RUNNING', 'QUEUED'],
) {
  const filter: { engagementId?: string; statusIn?: string[] } = {};
  if (engagementId) filter.engagementId = engagementId;
  if (statuses.length) filter.statusIn = statuses;

  const { data, loading, error } = useQuery<{ allScans: RawScan[] }>(ALL_SCANS_QUERY, {
    variables: { filter },
    pollInterval: 3000,
    fetchPolicy: 'cache-and-network',
  });

  const active: CockpitJob[] = [];
  for (const scan of data?.allScans ?? []) {
    for (const job of scan.jobs) {
      // Empty `statuses` ("Tous") keeps every job; otherwise the job's own status
      // must match so a multi-job scan doesn't surface a sibling in another state.
      if (statuses.length && !statuses.includes(job.status)) continue;
      active.push({
        scanId: scan.id,
        jobId: job.id,
        scannerName: job.scannerName,
        target: job.target,
        status: job.status,
        startedAt: job.startedAt,
      });
    }
  }
  return { active, loading, error };
}
