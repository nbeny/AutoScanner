import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { IntegrationsService } from './integrations.service';
import { IntegrationsResolver } from './integrations.resolver';
import { secretBoxProvider } from './secret-box.provider';

@Module({
  imports: [AuthModule],
  providers: [IntegrationsService, IntegrationsResolver, secretBoxProvider],
})
export class IntegrationsModule {}
