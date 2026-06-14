import { Module } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

import { SecretBox } from '@autoscanner/common';
import { AppConfigService } from '@autoscanner/config';
import type { MailTransport } from '@autoscanner/notifications';
import {
  EmailAdapter,
  SlackAdapter,
  DiscordAdapter,
  GenericWebhookAdapter,
  NotificationDispatcher,
} from '@autoscanner/notifications';

export const SECRET_BOX = Symbol('SECRET_BOX');
const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

@Module({
  providers: [
    // SECRET_BOX — mirrors api-credentials provider
    {
      provide: SECRET_BOX,
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => new SecretBox(cfg.env.MASTER_ENCRYPTION_KEY),
    },

    // MailTransport — nodemailer if SMTP_URL is set, else a throwing stub
    {
      provide: MAIL_TRANSPORT,
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService): MailTransport => {
        if (cfg.env.SMTP_URL) {
          const transporter = nodemailer.createTransport(cfg.env.SMTP_URL);
          return {
            sendMail: async (opts: { to: string; from: string; subject: string; text: string }) => {
              await transporter.sendMail({
                to: opts.to,
                from: opts.from,
                subject: opts.subject,
                text: opts.text,
              });
            },
          };
        }
        // Stub that fails clearly when SMTP is not configured
        return {
          sendMail: async () => {
            throw new Error('SMTP not configured — set SMTP_URL to enable email notifications');
          },
        };
      },
    },

    // Four adapters
    {
      provide: EmailAdapter,
      inject: [MAIL_TRANSPORT, AppConfigService],
      useFactory: (transport: MailTransport, cfg: AppConfigService) =>
        new EmailAdapter(transport, cfg.env.NOTIFICATIONS_FROM ?? 'autoscanner@localhost'),
    },
    { provide: SlackAdapter, useClass: SlackAdapter },
    { provide: DiscordAdapter, useClass: DiscordAdapter },
    { provide: GenericWebhookAdapter, useClass: GenericWebhookAdapter },

    // NotificationDispatcher wired with all four adapters
    {
      provide: NotificationDispatcher,
      inject: [EmailAdapter, SlackAdapter, DiscordAdapter, GenericWebhookAdapter],
      useFactory: (
        email: EmailAdapter,
        slack: SlackAdapter,
        discord: DiscordAdapter,
        webhook: GenericWebhookAdapter,
      ) => new NotificationDispatcher([email, slack, discord, webhook]),
    },
  ],
  exports: [NotificationDispatcher, SECRET_BOX],
})
export class NotificationAdaptersModule {}
