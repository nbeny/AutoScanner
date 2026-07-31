import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { MessagingModule } from '@autoscanner/messaging';

import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { IpAddressPersister } from './persisters/ip-address-persister';
import { DnsRecordPersister } from './persisters/dns-record-persister';
import { SubdomainIpPersister } from './persisters/subdomain-ip-persister';
import { EndpointPersister } from './persisters/endpoint-persister';
import { EmailPersister } from './persisters/email-persister';
import { IdentityPersister } from './persisters/identity-persister';
import { BreachExposurePersister } from './persisters/breach-exposure-persister';
import { OrgMetadataPersister } from './persisters/org-metadata-persister';
import { TlsCertificatePersister } from './persisters/tls-certificate-persister';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule, MessagingModule.forRoot()],
  controllers: [DiscoveryController],
  providers: [
    DiscoveryService,
    IpAddressPersister,
    DnsRecordPersister,
    SubdomainIpPersister,
    EndpointPersister,
    EmailPersister,
    IdentityPersister,
    BreachExposurePersister,
    OrgMetadataPersister,
    TlsCertificatePersister,
  ],
})
export class AppModule {}
