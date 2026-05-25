import type { JobsOptions, QueueOptions } from 'bullmq';

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 7 * 86_400, count: 5_000 },
  removeOnFail: { age: 30 * 86_400 },
};

export function buildQueueOptions(redisUrl: string): QueueOptions {
  return {
    connection: { url: redisUrl } as QueueOptions['connection'],
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  };
}
