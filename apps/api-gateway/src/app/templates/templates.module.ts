import { Module } from '@nestjs/common';

import { CapabilityModule } from '@autoscanner/auth';

import { AuthModule } from '../auth/auth.module';
import { TemplatesResolver } from './templates.resolver';
import { TemplatesService } from './templates.service';

import './dto/template-run-status.enum';

@Module({
  imports: [AuthModule, CapabilityModule],
  providers: [TemplatesService, TemplatesResolver],
})
export class TemplatesModule {}
