import { UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailObject } from './dto/email.object';
import { OrgMetadataObject } from './dto/org-metadata.object';
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
}
