import type { NotificationChannelType } from '@prisma/client';
import type { DeliveryContext, NotificationAdapter } from './adapter.types';

export class DiscordAdapter implements NotificationAdapter {
  readonly type: NotificationChannelType = 'DISCORD';

  async send(ctx: DeliveryContext): Promise<void> {
    // TODO(security): the target URL is user-supplied — add an SSRF allowlist
    // (block private/link-local ranges + non-http(s) schemes) before exposing
    // notifications to non-operator tenants.
    const webhookUrl = ctx.config['webhookUrl'] as string;
    const body = JSON.stringify({ content: `**${ctx.message.subject}**\n${ctx.message.body}` });
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    if (!res.ok) {
      throw new Error(`Discord webhook returned ${res.status}`);
    }
  }
}
