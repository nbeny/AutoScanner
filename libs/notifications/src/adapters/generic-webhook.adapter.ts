import { createHmac } from 'crypto';
import type { NotificationChannelType } from '@prisma/client';
import type { DeliveryContext, NotificationAdapter } from './adapter.types';

export class GenericWebhookAdapter implements NotificationAdapter {
  readonly type: NotificationChannelType = 'WEBHOOK';

  async send(ctx: DeliveryContext): Promise<void> {
    const url = ctx.config['url'] as string;
    const secret = ctx.config['secret'] as string | undefined;
    const bodyStr = JSON.stringify({ subject: ctx.message.subject, body: ctx.message.body });

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (secret) {
      const sig = createHmac('sha256', secret).update(bodyStr).digest('hex');
      headers['x-autoscanner-signature'] = sig;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: bodyStr,
    });
    if (!res.ok) {
      throw new Error(`Webhook returned ${res.status}`);
    }
  }
}
