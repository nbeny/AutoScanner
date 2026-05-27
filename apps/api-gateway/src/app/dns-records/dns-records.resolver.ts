import { UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DnsRecordObject } from './dto/dns-record.object';
import { DnsRecordsService } from './dns-records.service';

@Resolver(() => DnsRecordObject)
@UseGuards(JwtAuthGuard)
export class DnsRecordsResolver {
  constructor(private readonly svc: DnsRecordsService) {}

  @Query(() => [DnsRecordObject])
  dnsRecords(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
  ): Promise<DnsRecordObject[]> {
    return this.svc.listForOwner(user.id, engagementId) as Promise<DnsRecordObject[]>;
  }
}
