import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { SCAN_CONTROL_CHANNEL, type ScanControlMessage } from '@autoscanner/queues';

export const SCAN_CONTROL_REDIS = Symbol('SCAN_CONTROL_REDIS');

@Injectable()
export class ScanControlPublisher {
  constructor(@Inject(SCAN_CONTROL_REDIS) private readonly redis: Redis) {}

  async publishCancel(scanJobId: string): Promise<void> {
    const msg: ScanControlMessage = { type: 'CANCEL', scanJobId };
    await this.redis.publish(SCAN_CONTROL_CHANNEL, JSON.stringify(msg));
  }
}
