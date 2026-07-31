import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsResolver } from './notifications.resolver';
import { NotificationsService } from './notifications.service';
import { secretBoxProvider } from './secret-box.provider';

import './dto/enums';

@Module({
  imports: [AuthModule],
  providers: [NotificationsService, NotificationsResolver, secretBoxProvider],
})
export class NotificationsModule {}
