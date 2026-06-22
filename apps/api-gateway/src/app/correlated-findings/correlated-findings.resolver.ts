import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CorrelatedFindingDetailObject } from './dto/correlated-finding-detail.object';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Severity } from '../findings/dto/severity.enum';
import { CorrelatedFindingsService } from './correlated-findings.service';
import { CorrelatedFindingObject } from './dto/correlated-finding.object';
import { FindingStatus } from './dto/finding-status.enum';
import { CorrelatedFindingsFilterInput } from './dto/correlated-findings-filter.input';

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

  @Query(() => [CorrelatedFindingObject], { name: 'allCorrelatedFindings' })
  allCorrelatedFindings(
    @CurrentUser() user: User,
    @Args('filter', { type: () => CorrelatedFindingsFilterInput, nullable: true })
    filter?: CorrelatedFindingsFilterInput,
  ): Promise<CorrelatedFindingObject[]> {
    return this.svc.listAllForOwner(user.id, filter);
  }

  @Query(() => CorrelatedFindingDetailObject)
  correlatedFinding(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<CorrelatedFindingDetailObject> {
    return this.svc.getDetail(user.id, id);
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

  @Mutation(() => CorrelatedFindingObject)
  setFindingNote(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
    @Args('note', { type: () => String }) note: string,
  ): Promise<CorrelatedFindingObject> {
    return this.svc.setNote(user.id, id, note);
  }

  @Mutation(() => CorrelatedFindingObject)
  setFindingRemediation(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
    @Args('remediation', { type: () => String }) remediation: string,
  ): Promise<CorrelatedFindingObject> {
    return this.svc.setRemediation(user.id, id, remediation);
  }
}
