import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ApiCredentialsResolver } from './api-credentials.resolver';
import { ApiCredentialsService } from './api-credentials.service';
import { secretBoxProvider } from './secret-box.provider';

@Module({
  imports: [AuthModule],
  providers: [ApiCredentialsResolver, ApiCredentialsService, secretBoxProvider],
})
export class ApiCredentialsModule {}
