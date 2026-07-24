export const QueueName = {
  SCAN_JOBS: 'scan-jobs',
  PARSE_JOBS: 'parse-jobs',
  TEMPLATE_RUNS: 'template-runs',
  CVE_ENRICHMENT: 'cve-enrichment',
  CVE_DISCOVERY: 'cve-discovery',
  NVD_SYNC: 'nvd-sync',
  REPORT_JOBS: 'report-jobs',
  NOTIFICATION_JOBS: 'notification-jobs',
  WEBHOOK_JOBS: 'webhook-jobs',
  AI_RUNS: 'ai-runs',
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];
