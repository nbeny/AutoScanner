import type { NotificationChannelType } from '@prisma/client';
import type { DeliveryContext, NotificationAdapter } from './adapter.types';

export class SlackAdapter implements NotificationAdapter {
  readonly type: NotificationChannelType = 'SLACK';

  async send(ctx: DeliveryContext): Promise<void> {
    const webhookUrl = ctx.config['webhookUrl'] as string;
    const body = JSON.stringify({ text: `*${ctx.message.subject}*\n${ctx.message.body}` });
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    if (!res.ok) {
      throw new Error(`Slack webhook returned ${res.status}`);
    }
  }
}
