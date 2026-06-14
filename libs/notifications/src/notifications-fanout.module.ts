import { Module } from '@nestjs/common';
import { PrismaModule } from '@autoscanner/database';
import { NotificationsFanoutService } from './notifications-fanout.service';

@Module({
  imports: [PrismaModule],
  providers: [NotificationsFanoutService],
  exports: [NotificationsFanoutService],
})
export class NotificationsFanoutModule {}
