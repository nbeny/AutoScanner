export const QueueName = {
  SCAN_JOBS: 'scan-jobs',
  PARSE_JOBS: 'parse-jobs',
  TEMPLATE_RUNS: 'template-runs',
  CVE_ENRICHMENT: 'cve-enrichment',
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];
