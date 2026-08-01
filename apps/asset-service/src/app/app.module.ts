import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { MessagingModule } from '@autoscanner/messaging';

import { RiskClient } from '@autoscanner/service-clients';

import { AssetController } from './asset.controller';
import { DiscoveryClient } from './discovery.client';
import { ParseBatchService } from './parse-batch.service';
import { RiskService } from './risk.service';
import { AssetPersister } from './persisters/asset-persister';
import { PortPersister } from './persisters/port-persister';
import { ServicePersister } from './persisters/service-persister';
import { TechnologyPersister } from './persisters/technology-persister';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule, MessagingModule.forRoot()],
  controllers: [AssetController],
  providers: [
    DiscoveryClient,
    RiskClient,
    ParseBatchService,
    RiskService,
    AssetPersister,
    PortPersister,
    ServicePersister,
    TechnologyPersister,
  ],
})
export class AppModule {}
