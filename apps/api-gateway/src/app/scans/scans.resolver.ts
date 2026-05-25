import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RunScanInput } from './dto/run-scan.input';
import { ScanObject } from './dto/scan.object';
import { ScansService } from './scans.service';

@Resolver(() => ScanObject)
@UseGuards(JwtAuthGuard)
export class ScansResolver {
  constructor(private readonly svc: ScansService) {}

  @Mutation(() => ScanObject)
  runScan(@CurrentUser() user: User, @Args('input') input: RunScanInput): Promise<ScanObject> {
    return this.svc.runScan(user.id, input) as Promise<ScanObject>;
  }

  @Query(() => [ScanObject])
  scans(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
  ): Promise<ScanObject[]> {
    return this.svc.listForOwner(user.id, engagementId) as Promise<ScanObject[]>;
  }

  @Query(() => ScanObject)
  scan(@CurrentUser() user: User, @Args('id', { type: () => ID }) id: string): Promise<ScanObject> {
    return this.svc.getForOwner(user.id, id) as Promise<ScanObject>;
  }
}
