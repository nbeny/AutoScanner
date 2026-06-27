import { Module } from '@nestjs/common';
import { PrismaModule } from '@autoscanner/database';
import { CapabilityService } from './capability.service';

@Module({
  imports: [PrismaModule],
  providers: [CapabilityService],
  exports: [CapabilityService],
})
export class CapabilityModule {}
