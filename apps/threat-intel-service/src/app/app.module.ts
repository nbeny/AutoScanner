import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { MessagingModule } from '@autoscanner/messaging';

import { ThreatIntelController } from './threat-intel.controller';
import { ThreatIntelService } from './threat-intel.service';
import { FindingCreatedConsumer } from './finding-created.consumer';
import { KevSource } from './sources/kev.source';
import { THREAT_INTEL_SOURCES, type ThreatIntelSource } from './sources/threat-intel-source';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule, MessagingModule.forRoot()],
  controllers: [ThreatIntelController],
  providers: [
    ThreatIntelService,
    FindingCreatedConsumer,
    // Factory-provided so Nest doesn't try to inject KevSource's optional fetcher param; the
    // default CISA fetch applies in production, and tests construct `new KevSource(mock)`.
    { provide: KevSource, useFactory: () => new KevSource() },
    {
      // The ordered source list. Add new providers here — the service and consumer are blind
      // to which sources exist.
      provide: THREAT_INTEL_SOURCES,
      useFactory: (kev: KevSource): ThreatIntelSource[] => [kev],
      inject: [KevSource],
    },
  ],
})
export class AppModule {}
