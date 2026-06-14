import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SchedulesResolver } from './schedules.resolver';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [AuthModule],
  providers: [SchedulesService, SchedulesResolver],
})
export class SchedulesModule {}
