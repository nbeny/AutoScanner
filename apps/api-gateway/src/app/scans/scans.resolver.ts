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
import { ScannerUsageStat } from './dto/scanner-usage.object';
import { ScanCommandPreview } from './dto/scan-command-preview.object';
import { ScanObject } from './dto/scan.object';
import { ScansService } from './scans.service';
import { PreviewScanCommandService } from './preview-scan-command.service';

@Resolver(() => ScanObject)
@UseGuards(JwtAuthGuard)
export class ScansResolver {
  constructor(
    private readonly svc: ScansService,
    @Inject(LOG_STREAM_SUBSCRIBER) private readonly logSubscriber: LogStreamSubscriber,
    private readonly previewSvc: PreviewScanCommandService,
  ) {}

  @Query(() => ScanCommandPreview, { name: 'previewScanCommand' })
  previewScanCommand(
    @Args('scannerName') scannerName: string,
    @Args('target') target: string,
    @Args('optionsJson', { type: () => String, nullable: true }) optionsJson?: string,
  ): ScanCommandPreview {
    return this.previewSvc.preview(scannerName, target, optionsJson);
  }

  @Mutation(() => ScanObject)
  runScan(@CurrentUser() user: User, @Args('input') input: RunScanInput): Promise<ScanObject> {
    // `as unknown as` (like allScans): the service now returns the scan with its
    // Prisma ScanJob[] attached, which doesn't structurally match ScanJobObject
    // (findingCount is a computed @ResolveField), so a direct cast is rejected.
    return this.svc.runScan(user.id, input) as unknown as Promise<ScanObject>;
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

  @Query(() => [ScannerUsageStat], { name: 'scannerUsageStats' })
  scannerUsageStats(
    @CurrentUser() user: User,
    @Args('scannerName') scannerName: string,
  ): Promise<ScannerUsageStat[]> {
    return this.svc.scannerUsageStats(user.id, scannerName) as Promise<ScannerUsageStat[]>;
  }

  @Query(() => String, { name: 'scanJobLogHistory' })
  scanJobLogHistory(@Args('scanJobId', { type: () => ID }) scanJobId: string): Promise<string> {
    return this.svc.getScanJobLogs(scanJobId);
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

  @Mutation(() => Int, { name: 'cancelAllScans' })
  async cancelAllScans(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
  ): Promise<number> {
    return this.svc.cancelAllScans(user.id, engagementId);
  }

  @Mutation(() => ScanObject)
  async retryScanJob(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ScanObject> {
    return this.svc.retryScanJob(user.id, id) as unknown as Promise<ScanObject>;
  }

  @Mutation(() => ScanObject)
  async retryScan(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ScanObject> {
    return this.svc.retryScan(user.id, id) as unknown as Promise<ScanObject>;
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
  // The platform no longer parses scanner output into findings/entities, but the
  // GraphQL `ScanJob.findingCount` field is still selected by the frontend. Keep
  // the field and return the constant 0 rather than querying a dropped table.
  @ResolveField(() => Int, { name: 'findingCount' })
  findingCount(@Parent() _job: ScanJobObject): number {
    return 0;
  }
}
