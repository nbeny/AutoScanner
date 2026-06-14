import type { NotificationChannelType } from '@prisma/client';
import type { RenderedMessage } from '../event-types';

export interface MailTransport {
  sendMail(opts: { to: string; from: string; subject: string; text: string }): Promise<void>;
}

export interface DeliveryContext {
  type: NotificationChannelType;
  config: Record<string, unknown>; // decrypted
  message: RenderedMessage;
}

export interface NotificationAdapter {
  readonly type: NotificationChannelType;
  send(ctx: DeliveryContext): Promise<void>;
}
