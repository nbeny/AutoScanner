import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Severity } from '../findings/dto/severity.enum';
import { CorrelatedFindingsService } from './correlated-findings.service';
import { CorrelatedFindingObject } from './dto/correlated-finding.object';
import { FindingStatus } from './dto/finding-status.enum';

@Resolver(() => CorrelatedFindingObject)
@UseGuards(JwtAuthGuard)
export class CorrelatedFindingsResolver {
  constructor(private readonly svc: CorrelatedFindingsService) {}

  @Query(() => [CorrelatedFindingObject])
  correlatedFindings(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
    @Args('severity', { type: () => Severity, nullable: true }) severity?: Severity,
    @Args('status', { type: () => FindingStatus, nullable: true }) status?: FindingStatus,
    @Args('search', { type: () => String, nullable: true }) search?: string,
    @Args('limit', { type: () => Int, defaultValue: 100 }) limit?: number,
    @Args('offset', { type: () => Int, defaultValue: 0 }) offset?: number,
  ): Promise<CorrelatedFindingObject[]> {
    return this.svc.list(user.id, engagementId, { severity, status, search, limit, offset });
  }

  @Mutation(() => CorrelatedFindingObject)
  setFindingStatus(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
    @Args('status', { type: () => FindingStatus }) status: FindingStatus,
    @Args('note', { type: () => String, nullable: true }) note?: string,
  ): Promise<CorrelatedFindingObject> {
    return this.svc.setStatus(user.id, id, status, note);
  }
}
