import type { NotificationChannelType } from '@prisma/client';
import type { DeliveryContext, MailTransport, NotificationAdapter } from './adapter.types';

export class EmailAdapter implements NotificationAdapter {
  readonly type: NotificationChannelType = 'EMAIL';

  constructor(
    private readonly transport: MailTransport,
    private readonly defaultFrom: string,
  ) {}

  async send(ctx: DeliveryContext): Promise<void> {
    const to = ctx.config['to'] as string;
    const from = (ctx.config['from'] as string | undefined) ?? this.defaultFrom;
    await this.transport.sendMail({
      to,
      from,
      subject: ctx.message.subject,
      text: ctx.message.body,
    });
  }
}
