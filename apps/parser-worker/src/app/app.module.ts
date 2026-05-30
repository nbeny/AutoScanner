import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { CorrelationModule } from '@autoscanner/correlation';
import { PrismaModule } from '@autoscanner/database';
import { QueuesModule } from '@autoscanner/queues';
import { ParsersModule } from '@autoscanner/parsers';
import { StorageModule } from '@autoscanner/storage';

import { ParseJobProcessor } from './parse-job.processor';
import { AssetPersister } from './persisters/asset-persister';
import { DnsRecordPersister } from './persisters/dns-record-persister';
import { FindingPersister } from './persisters/finding-persister';
import { IpAddressPersister } from './persisters/ip-address-persister';
import { PortPersister } from './persisters/port-persister';
import { ServicePersister } from './persisters/service-persister';
import { SubdomainIpPersister } from './persisters/subdomain-ip-persister';
import { TechnologyPersister } from './persisters/technology-persister';

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    CorrelationModule,
    PrismaModule,
    QueuesModule,
    StorageModule,
    ParsersModule,
  ],
  providers: [
    ParseJobProcessor,
    AssetPersister,
    PortPersister,
    ServicePersister,
    TechnologyPersister,
    FindingPersister,
    IpAddressPersister,
    DnsRecordPersister,
    SubdomainIpPersister,
  ],
})
export class AppModule {}
