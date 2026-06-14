import type { NotificationChannelType } from '@prisma/client';
import type { NotificationAdapter } from './adapters/adapter.types';
import type { RenderedMessage } from './event-types';

export class NotificationDispatcher {
  constructor(private readonly adapters: NotificationAdapter[]) {}

  async dispatch(
    type: NotificationChannelType,
    config: Record<string, unknown>,
    message: RenderedMessage,
  ): Promise<void> {
    const adapter = this.adapters.find((a) => a.type === type);
    if (!adapter) {
      throw new Error(`no adapter for ${type}`);
    }
    await adapter.send({ type, config, message });
  }
}
