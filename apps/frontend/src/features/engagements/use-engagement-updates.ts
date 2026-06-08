import { useApolloClient, useSubscription } from '@apollo/client';
import { useEffect, useRef } from 'react';

import { ENGAGEMENT_UPDATED_SUBSCRIPTION } from '../../lib/graphql/queries';

export const HEARTBEAT_MS = 30_000;

export enum EngagementUpdateKind {
  ASSET_ADDED = 'ASSET_ADDED',
  ASSET_RISK_CHANGED = 'ASSET_RISK_CHANGED',
  FINDING_RAISED = 'FINDING_RAISED',
  OBSERVATION_ADDED = 'OBSERVATION_ADDED',
  TEMPLATE_RUN_STATUS_CHANGED = 'TEMPLATE_RUN_STATUS_CHANGED',
  CVE_ENRICHED = 'CVE_ENRICHED',
}

export interface EngagementUpdateEvent {
  kind: EngagementUpdateKind;
  engagementId: string;
  assetId: string | null;
  templateRunId: string | null;
  ts: string;
}

const QUERIES_BY_KIND: Record<EngagementUpdateKind, string[]> = {
  [EngagementUpdateKind.ASSET_ADDED]: [
    'UnifiedAssetsScored',
    'AssetFacets',
    'EngagementOverview',
    'TopAssets',
  ],
  [EngagementUpdateKind.ASSET_RISK_CHANGED]: ['UnifiedAssetsScored', 'TopAssets', 'AssetDetail'],
  [EngagementUpdateKind.FINDING_RAISED]: [
    'Findings',
    'TopFindings',
    'EngagementOverview',
    'AssetFacets',
    'AssetDetail',
  ],
  [EngagementUpdateKind.OBSERVATION_ADDED]: ['AssetDetail'],
  [EngagementUpdateKind.TEMPLATE_RUN_STATUS_CHANGED]: [
    'RecentTemplateRuns',
    'EngagementOverview',
    'TemplateRun',
  ],
  [EngagementUpdateKind.CVE_ENRICHED]: ['CveInfo', 'Findings', 'TopFindings', 'AssetDetail'],
};

export function useEngagementUpdates(engagementId: string | null | undefined): void {
  const client = useApolloClient();
  const lastEventAtRef = useRef<number>(Date.now());

  const { data } = useSubscription<{ engagementUpdated: EngagementUpdateEvent }>(
    ENGAGEMENT_UPDATED_SUBSCRIPTION,
    {
      variables: { engagementId },
      skip: !engagementId,
    },
  );

  useEffect(() => {
    if (!data?.engagementUpdated) return;
    lastEventAtRef.current = Date.now();
    const queries = QUERIES_BY_KIND[data.engagementUpdated.kind];
    if (queries && queries.length > 0) {
      void client.refetchQueries({ include: queries });
    }
  }, [client, data]);

  useEffect(() => {
    if (!engagementId) return;
    const interval = window.setInterval(() => {
      const idleMs = Date.now() - lastEventAtRef.current;
      if (idleMs >= HEARTBEAT_MS) {
        void client.refetchQueries({ include: ['EngagementOverview', 'RecentTemplateRuns'] });
      }
    }, HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [client, engagementId]);
}
