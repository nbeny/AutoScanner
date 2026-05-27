export const QueueName = {
  SCAN_JOBS: 'scan-jobs',
  PARSE_JOBS: 'parse-jobs',
  TEMPLATE_RUNS: 'template-runs',
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];
