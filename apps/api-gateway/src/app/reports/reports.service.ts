import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Readable } from 'node:stream';
import type { Report, ReportTemplate } from '@prisma/client';
import { Prisma, ReportStatus } from '@prisma/client';

import { ConflictError, NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import type { ReportJobPayload } from '@autoscanner/queues';
import { OBJECT_STORAGE, type ObjectStorage } from '@autoscanner/storage';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';

import { GenerateReportInput } from './dto/generate-report.input';

const DOWNLOAD_URL_TTL_SECONDS = 3600;
const REPORT_TOPIC = 'security.report.requested';

export type ReportWithTemplate = Report & { template: ReportTemplate };

export interface ReportDownloadStream {
  stream: Readable;
  contentType: string;
  sizeBytes: number;
  filename: string;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_BUS) private readonly bus: JobBus,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async generateReport(userId: string, input: GenerateReportInput): Promise<ReportWithTemplate> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: input.engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', input.engagementId);

    const template = await this.prisma.reportTemplate.findUnique({
      where: { slug: input.templateSlug },
    });
    if (!template) throw new NotFoundError('ReportTemplate', input.templateSlug);

    if (input.scanId) {
      const scan = await this.prisma.scan.findFirst({
        where: { id: input.scanId, engagementId: input.engagementId },
        select: { id: true },
      });
      if (!scan) throw new NotFoundError('Scan', input.scanId);
    }

    const report = (await this.prisma.report.create({
      data: {
        engagementId: input.engagementId,
        scanId: input.scanId ?? null,
        templateId: template.id,
        format: template.format,
        status: ReportStatus.PENDING,
        filters: Prisma.JsonNull,
        createdById: userId,
      },
      include: { template: true },
    })) as ReportWithTemplate;

    try {
      await this.bus.publish<ReportJobPayload>(REPORT_TOPIC, report.id, { reportId: report.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to enqueue report=${report.id}: ${message}`);
      await this.prisma.report
        .update({
          where: { id: report.id },
          data: {
            status: ReportStatus.FAILED,
            errorMessage: `enqueue failed: ${message}`.slice(0, 500),
            completedAt: new Date(),
          },
        })
        .catch((updateErr) => {
          const um = updateErr instanceof Error ? updateErr.message : String(updateErr);
          this.logger.warn(`report=${report.id} FAILED-status reconciliation failed: ${um}`);
        });
      throw err;
    }

    this.logger.log(`Enqueued report=${report.id} template=${template.slug}`);
    return report;
  }

  listForOwner(userId: string, engagementId: string | null): Promise<ReportWithTemplate[]> {
    return this.prisma.report.findMany({
      where: engagementId
        ? { engagementId, engagement: { ownerId: userId, deletedAt: null } }
        : { engagement: { ownerId: userId, deletedAt: null } },
      include: { template: true },
      orderBy: { createdAt: 'desc' },
    }) as Promise<ReportWithTemplate[]>;
  }

  async getForOwner(userId: string, reportId: string): Promise<ReportWithTemplate> {
    const report = await this.prisma.report.findFirst({
      where: { id: reportId, engagement: { ownerId: userId, deletedAt: null } },
      include: { template: true },
    });
    if (!report) throw new NotFoundError('Report', reportId);
    return report as ReportWithTemplate;
  }

  listTemplates(): Promise<ReportTemplate[]> {
    return this.prisma.reportTemplate.findMany({
      orderBy: [{ format: 'asc' }, { name: 'asc' }],
    });
  }

  async presignDownloadUrl(report: Report): Promise<string | null> {
    if (report.status !== ReportStatus.READY || !report.storageKey) return null;
    return this.storage.presignGetUrl({
      bucket: 'reports',
      key: report.storageKey,
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
    });
  }

  async streamDownload(userId: string, reportId: string): Promise<ReportDownloadStream> {
    const report = await this.getForOwner(userId, reportId);
    if (report.status !== ReportStatus.READY || !report.storageKey) {
      throw new ConflictError(`Report ${reportId} is not READY (status=${report.status})`);
    }
    const obj = await this.storage.getObject('reports', report.storageKey);
    const ext = report.storageKey.split('.').slice(1).join('.') || 'bin';
    return {
      stream: obj.body,
      contentType: report.contentType ?? obj.contentType ?? 'application/octet-stream',
      sizeBytes: report.sizeBytes ?? obj.contentLength ?? 0,
      filename: `report-${report.id}.${ext}`,
    };
  }
}
