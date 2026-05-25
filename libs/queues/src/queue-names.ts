export const QueueName = {
  SCAN_JOBS: 'scan-jobs',
  PARSE_JOBS: 'parse-jobs',
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];
