export enum EngagementUpdateKind {
  ASSET_ADDED = 'ASSET_ADDED',
  ASSET_RISK_CHANGED = 'ASSET_RISK_CHANGED',
  FINDING_RAISED = 'FINDING_RAISED',
  OBSERVATION_ADDED = 'OBSERVATION_ADDED',
  TEMPLATE_RUN_STATUS_CHANGED = 'TEMPLATE_RUN_STATUS_CHANGED',
  CVE_ENRICHED = 'CVE_ENRICHED',
  SCAN_JOB_STATUS_CHANGED = 'SCAN_JOB_STATUS_CHANGED',
}

export interface EngagementUpdateEvent {
  kind: EngagementUpdateKind;
  engagementId: string;
  assetId?: string;
  templateRunId?: string;
  scanJobId?: string;
  severity?: string;
  title?: string;
  ts: string;
}

export function engagementChannel(engagementId: string): string {
  return `engagement:${engagementId}:updates`;
}

export function encodeEngagementEvent(ev: EngagementUpdateEvent): string {
  return JSON.stringify(ev);
}

export function decodeEngagementEvent(raw: string): EngagementUpdateEvent {
  const parsed = JSON.parse(raw) as EngagementUpdateEvent;
  if (
    !parsed ||
    typeof parsed.kind !== 'string' ||
    typeof parsed.engagementId !== 'string' ||
    typeof parsed.ts !== 'string'
  ) {
    throw new Error('Invalid EngagementUpdateEvent payload');
  }
  return parsed;
}
