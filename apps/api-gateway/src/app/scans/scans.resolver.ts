import { Inject, UseGuards } from '@nestjs/common';
import {
  Args,
  ID,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
  Subscription,
} from '@nestjs/graphql';
import type { User } from '@prisma/client';

import {
  LOG_STREAM_SUBSCRIBER,
  type LogChunk,
  type LogStreamSubscriber,
} from '@autoscanner/log-stream';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RunScanInput } from './dto/run-scan.input';
import { ScansFilterInput } from './dto/scans-filter.input';
import { LogStreamKind, ScanLogChunkObject } from './dto/scan-log-chunk.object';
import { ScanJobObject } from './dto/scan-job.object';
import { ScanObject } from './dto/scan.object';
import { ScansService } from './scans.service';

@Resolver(() => ScanObject)
@UseGuards(JwtAuthGuard)
export class ScansResolver {
  constructor(
    private readonly svc: ScansService,
    @Inject(LOG_STREAM_SUBSCRIBER) private readonly logSubscriber: LogStreamSubscriber,
  ) {}

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

  @Query(() => [ScanObject], { name: 'allScans' })
  async allScans(
    @CurrentUser() user: User,
    @Args('filter', { type: () => ScansFilterInput, nullable: true }) filter?: ScansFilterInput,
  ): Promise<ScanObject[]> {
    return this.svc.listAllForOwner(user.id, filter) as unknown as Promise<ScanObject[]>;
  }

  @Mutation(() => ScanJobObject)
  async cancelScanJob(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ScanJobObject> {
    return this.svc.cancelScanJob(user.id, id) as unknown as Promise<ScanJobObject>;
  }

  @Mutation(() => ScanObject)
  async cancelScan(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ScanObject> {
    return this.svc.cancelScan(user.id, id) as Promise<ScanObject>;
  }

  @Subscription(() => ScanLogChunkObject, {
    name: 'scanJobLogs',
    resolve: (chunk: LogChunk): ScanLogChunkObject => ({
      scanJobId: chunk.scanJobId,
      stream: chunk.stream === 'stdout' ? LogStreamKind.STDOUT : LogStreamKind.STDERR,
      ts: chunk.ts,
      chunk: chunk.chunk,
    }),
  })
  scanJobLogs(@Args('scanJobId', { type: () => ID }) scanJobId: string): AsyncIterable<LogChunk> {
    return this.logSubscriber.subscribe(scanJobId);
  }
}

@Resolver(() => ScanJobObject)
export class ScanJobFieldResolver {
  constructor(private readonly scansService: ScansService) {}

  @ResolveField(() => Int, { name: 'findingCount' })
  async findingCount(@Parent() job: ScanJobObject): Promise<number> {
    return this.scansService.countFindingsForJob(job.id);
  }
}
