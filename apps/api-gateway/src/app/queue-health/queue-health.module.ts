import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { QueueHealthResolver } from './queue-health.resolver';

@Module({
  imports: [AuthModule],
  providers: [QueueHealthResolver],
})
export class QueueHealthModule {}
