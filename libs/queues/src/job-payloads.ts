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

export interface ReportJobPayload {
  reportId: string;
}

export interface NotificationJobPayload {
  notificationId: string;
}

export interface WebhookJobPayload {
  webhookEventId: string;
}

export interface QueuePayloadMap {
  [QueueName.SCAN_JOBS]: ScanJobPayload;
  [QueueName.PARSE_JOBS]: ParseJobPayload;
  [QueueName.TEMPLATE_RUNS]: TemplateRunPayload;
  [QueueName.CVE_ENRICHMENT]: CveEnrichmentPayload;
  [QueueName.CVE_DISCOVERY]: CveDiscoveryPayload;
  [QueueName.REPORT_JOBS]: ReportJobPayload;
  [QueueName.NOTIFICATION_JOBS]: NotificationJobPayload;
  [QueueName.WEBHOOK_JOBS]: WebhookJobPayload;
}

export type PayloadFor<Q extends QueueName> = QueuePayloadMap[Q];
