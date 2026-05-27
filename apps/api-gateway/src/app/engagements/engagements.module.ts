import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EngagementsResolver } from './engagements.resolver';
import { EngagementsService } from './engagements.service';

import './dto/engagement-status.enum';
import './dto/scope-rule-type.enum';
import './dto/scope-rule-target.enum';

@Module({
  imports: [AuthModule],
  providers: [EngagementsService, EngagementsResolver],
})
export class EngagementsModule {}
