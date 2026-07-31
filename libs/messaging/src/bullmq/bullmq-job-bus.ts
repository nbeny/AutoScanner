import { Queue } from 'bullmq';
import { JobBus, PublishOpts } from '../job-bus';

/** Maps a topic name back to the legacy BullMQ queue + job name for transitional dual-run. */
export interface LegacyRoute {
  queue: Queue;
  jobName: string;
}

export class BullMqJobBus implements JobBus {
  constructor(private readonly routes: Record<string, LegacyRoute>) {}

  async publish<T>(topic: string, _key: string, payload: T, opts: PublishOpts = {}): Promise<void> {
    const route = this.routes[topic];
    if (!route) throw new Error(`No legacy BullMQ route for topic ${topic}`);
    await route.queue.add(route.jobName, payload, {
      delay: opts.availableAt ? Math.max(0, opts.availableAt.getTime() - Date.now()) : undefined,
    });
  }
}
