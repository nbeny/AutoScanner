import { UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FindingObject } from './dto/finding.object';
import { Severity } from './dto/severity.enum';
import { FindingsService } from './findings.service';

@Resolver(() => FindingObject)
@UseGuards(JwtAuthGuard)
export class FindingsResolver {
  constructor(private readonly svc: FindingsService) {}

  @Query(() => [FindingObject])
  findings(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
    @Args('severities', { type: () => [Severity], nullable: true }) severities?: Severity[],
  ): Promise<FindingObject[]> {
    return this.svc.listForOwner(user.id, engagementId, severities) as Promise<FindingObject[]>;
  }
}
