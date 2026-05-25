import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EngagementsResolver } from './engagements.resolver';
import { EngagementsService } from './engagements.service';

@Module({
  imports: [AuthModule],
  providers: [EngagementsService, EngagementsResolver],
})
export class EngagementsModule {}
