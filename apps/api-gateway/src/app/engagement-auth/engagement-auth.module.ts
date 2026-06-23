import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { EngagementAuthResolver } from './engagement-auth.resolver';
import { EngagementAuthService } from './engagement-auth.service';
import { secretBoxProvider } from './secret-box.provider';

@Module({
  imports: [AuthModule],
  providers: [EngagementAuthResolver, EngagementAuthService, secretBoxProvider],
})
export class EngagementAuthModule {}
