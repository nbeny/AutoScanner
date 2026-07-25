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

const ACTIVE = new Set(['RUNNING', 'QUEUED']);

export function useActiveScanners(engagementId?: string) {
  // Filter to non-terminal scans server-side (statusIn) so history isn't
  // transmitted; the client-side ACTIVE check below stays as a defensive
  // guard against stale cache entries.
  const filter: { engagementId?: string; statusIn: string[] } = {
    statusIn: ['RUNNING', 'QUEUED'],
  };
  if (engagementId) filter.engagementId = engagementId;

  const { data, loading, error } = useQuery<{ allScans: RawScan[] }>(ALL_SCANS_QUERY, {
    variables: { filter },
    pollInterval: 3000,
    fetchPolicy: 'cache-and-network',
  });

  const active: CockpitJob[] = [];
  for (const scan of data?.allScans ?? []) {
    for (const job of scan.jobs) {
      if (ACTIVE.has(job.status)) {
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
  }
  return { active, loading, error };
}
