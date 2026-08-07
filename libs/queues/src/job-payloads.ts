import { QueueName } from './queue-names';

export interface ScanJobPayload {
  scanJobId: string;
  scannerName: string;
  target: string;
  input: Record<string, unknown>;
  engagementId: string;
}

export interface ParseJobPayload {
  scanJobId: string;
  rawOutputKey: string;
  parserName: string;
  scannerName: string;
  target: string;
  engagementId: string;
}

export interface TemplateRunPayload {
  templateRunId: string;
  engagementId: string;
}

export interface CveEnrichmentPayload {
  cveId: string;
}

export interface CveDiscoveryPayload {
  scanJobId: string;
  engagementId: string;
  assetId: string;
  assetCanonical: string;
  serviceId: string;
  cpe: string;
  location: string;
  product?: string;
  version?: string;
}

export interface NvdSyncPayload {
  mode: 'full' | 'incremental';
}

export interface ReportJobPayload {
  reportId: string;
}

export interface NotificationJobPayload {
  notificationId: string;
}

export interface WebhookJobPayload {
  webhookEventId: string;
}

export interface AiRunPayload {
  aiRunId: string;
  engagementId: string;
}

export interface KaliToolRunPayload {
  runId: string;
}

export interface KaliToolParsePayload {
  runId: string;
  rawOutputKey: string;
}

export interface QueuePayloadMap {
  [QueueName.SCAN_JOBS]: ScanJobPayload;
  [QueueName.PARSE_JOBS]: ParseJobPayload;
  [QueueName.TEMPLATE_RUNS]: TemplateRunPayload;
  [QueueName.CVE_ENRICHMENT]: CveEnrichmentPayload;
  [QueueName.CVE_DISCOVERY]: CveDiscoveryPayload;
  [QueueName.NVD_SYNC]: NvdSyncPayload;
  [QueueName.REPORT_JOBS]: ReportJobPayload;
  [QueueName.NOTIFICATION_JOBS]: NotificationJobPayload;
  [QueueName.WEBHOOK_JOBS]: WebhookJobPayload;
  [QueueName.AI_RUNS]: AiRunPayload;
}

export type PayloadFor<Q extends QueueName> = QueuePayloadMap[Q];
