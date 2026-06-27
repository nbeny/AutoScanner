import { Module } from '@nestjs/common';
import { CapabilityModule } from '@autoscanner/auth';
import { CapabilitiesResolver } from './capabilities.resolver';

@Module({
  imports: [CapabilityModule],
  providers: [CapabilitiesResolver],
})
export class CapabilitiesModule {}
