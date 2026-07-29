import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BreachExposureObject } from './dto/breach-exposure.object';
import { EmailObject } from './dto/email.object';
import { IdentityObject } from './dto/identity.object';
import { OrgMetadataObject } from './dto/org-metadata.object';
import { OsintRunResultObject } from './dto/osint-run-result.object';
import { RunOsintScanInput } from './dto/run-osint-scan.input';
import { OsintService } from './osint.service';

@Resolver()
@UseGuards(JwtAuthGuard)
export class OsintResolver {
  constructor(private readonly svc: OsintService) {}

  @Query(() => [EmailObject])
  emails(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
  ): Promise<EmailObject[]> {
    return this.svc.emails(user.id, engagementId);
  }

  @Query(() => [OrgMetadataObject])
  orgMetadata(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
  ): Promise<OrgMetadataObject[]> {
    return this.svc.orgMetadata(user.id, engagementId);
  }

  @Query(() => [IdentityObject])
  identities(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
    @Args('seed', { type: () => String, nullable: true }) seed?: string,
  ): Promise<IdentityObject[]> {
    return this.svc.identities(user.id, engagementId, seed ?? undefined);
  }

  @Query(() => [BreachExposureObject])
  breachExposures(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
    @Args('seed', { type: () => String, nullable: true }) seed?: string,
  ): Promise<BreachExposureObject[]> {
    return this.svc.breachExposures(user.id, engagementId, seed ?? undefined);
  }

  @Mutation(() => OsintRunResultObject)
  runOsintScan(
    @CurrentUser() user: User,
    @Args('input') input: RunOsintScanInput,
  ): Promise<OsintRunResultObject> {
    return this.svc.runOsintScan(user.id, input);
  }
}
