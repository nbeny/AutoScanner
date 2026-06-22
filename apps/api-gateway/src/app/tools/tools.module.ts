import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ToolsResolver } from './tools.resolver';
import { ToolsService } from './tools.service';

@Module({
  imports: [AuthModule],
  providers: [ToolsService, ToolsResolver],
})
export class ToolsModule {}
