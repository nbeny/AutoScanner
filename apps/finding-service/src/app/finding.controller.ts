import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type {
  AnnotationRequest,
  FindingBatchRequest,
  FindingBatchResponse,
  TriageRequest,
} from '@autoscanner/service-clients';

import { FindingBatchService } from './finding-batch.service';
import { CorrelationService } from './correlation.service';
import { DedupFindingsService } from './dedup-findings.service';
import { TriageService } from './triage.service';
import { AnnotationService } from './annotation.service';

/** Internal API — reached by other services over the private network, not exposed publicly. */
@Controller()
export class FindingController {
  constructor(
    private readonly batch: FindingBatchService,
    private readonly correlation: CorrelationService,
    private readonly dedup: DedupFindingsService,
    private readonly triage: TriageService,
    private readonly annotation: AnnotationService,
  ) {}

  @Get('health')
  @HttpCode(200)
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Post('internal/findings/batch')
  persistBatch(@Body() body: FindingBatchRequest): Promise<FindingBatchResponse> {
    return this.batch.persist(body);
  }

  @Post('internal/findings/correlate')
  correlate(
    @Body() body: { engagementId: string; assetIds?: string[] },
  ): Promise<{ clusters: number }> {
    return this.correlation.correlateFindings(body.engagementId, body.assetIds);
  }

  @Post('internal/findings/dedup')
  dedupFindings(@Body() body: { engagementId: string }): Promise<{ merged: number }> {
    return this.dedup.dedupFindings(body.engagementId);
  }

  @Post('internal/findings/status')
  setStatus(@Body() body: TriageRequest): Promise<{ id: string; status: string }> {
    return this.triage.setStatus(body);
  }

  @Post('internal/findings/annotate')
  annotate(@Body() body: AnnotationRequest): Promise<{ id: string }> {
    return this.annotation.setAnnotations(body);
  }
}
