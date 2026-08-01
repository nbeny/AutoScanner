import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AttackPathsService } from './attack-paths.service';
import { AttackPathsResolver } from './attack-paths.resolver';

@Module({
  imports: [AuthModule],
  providers: [AttackPathsService, AttackPathsResolver],
})
export class AttackPathsModule {}
