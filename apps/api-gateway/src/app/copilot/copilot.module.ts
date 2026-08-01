import { Module } from '@nestjs/common';
import { SecurityAgentsModule } from '@autoscanner/security-agents';

import { AuthModule } from '../auth/auth.module';
import { CopilotService } from './copilot.service';
import { CopilotResolver } from './copilot.resolver';

@Module({
  imports: [AuthModule, SecurityAgentsModule],
  providers: [CopilotService, CopilotResolver],
})
export class CopilotModule {}
