import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { SCAN_CONTROL_CHANNEL, type ScanControlMessage } from '@autoscanner/queues';

export const SCAN_CONTROL_SUB_REDIS = Symbol('SCAN_CONTROL_SUB_REDIS');

@Injectable()
export class ScanControlSubscriber implements OnModuleInit {
  private readonly controllers = new Map<string, AbortController>();

  constructor(@Inject(SCAN_CONTROL_SUB_REDIS) private readonly redis: Redis) {}

  async onModuleInit(): Promise<void> {
    await this.redis.subscribe(SCAN_CONTROL_CHANNEL);
    this.redis.on('message', (_channel: string, raw: string) => this.handleMessage(raw));
  }

  register(scanJobId: string, controller: AbortController): void {
    this.controllers.set(scanJobId, controller);
  }

  unregister(scanJobId: string): void {
    this.controllers.delete(scanJobId);
  }

  handleMessage(raw: string): void {
    let msg: ScanControlMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg && msg.type === 'CANCEL') {
      this.controllers.get(msg.scanJobId)?.abort();
    }
  }
}
