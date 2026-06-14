import { Module } from '@nestjs/common';
import { NotificationsFanoutService } from './notifications-fanout.service';

@Module({
  providers: [NotificationsFanoutService],
  exports: [NotificationsFanoutService],
})
export class NotificationsFanoutModule {}
