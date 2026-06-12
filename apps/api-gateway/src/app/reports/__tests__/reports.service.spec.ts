import { Readable } from 'node:stream';
import type { Queue } from 'bullmq';
import { ReportFormat, ReportStatus } from '@prisma/client';

import { ConflictError, NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';
import type { ReportJobPayload } from '@autoscanner/queues';
import type { ObjectStorage } from '@autoscanner/storage';

import { ReportsService } from '../reports.service';

const USER_ID = 'user_1';
const ENGAGEMENT_ID = 'eng_1';

function makeTemplate(overrides: Partial<{ slug: string; format: ReportFormat }> = {}) {
  return {
    id: 'tpl_1',
    slug: overrides.slug ?? 'json-full-export',
    name: 'JSON',
    description: null,
    format: overrides.format ?? ReportFormat.JSON,
    templateSource: '',
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeReport(overrides: Partial<{ status: ReportStatus; storageKey: string | null }> = {}) {
  return {
    id: 'rep_1',
    engagementId: ENGAGEMENT_ID,
    scanId: null,
    templateId: 'tpl_1',
    format: ReportFormat.JSON,
    status: overrides.status ?? ReportStatus.PENDING,
    filters: null,
    storageKey: overrides.storageKey ?? null,
    sizeBytes: null,
    contentType: null,
    errorMessage: null,
    createdById: USER_ID,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    template: makeTemplate(),
  };
}

describe('ReportsService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let queue: jest.Mocked<Queue<ReportJobPayload>>;
  let storage: jest.Mocked<ObjectStorage>;
  let svc: ReportsService;

  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn() },
      reportTemplate: { findUnique: jest.fn(), findMany: jest.fn() },
      scan: { findFirst: jest.fn() },
      report: {
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;
    queue = { add: jest.fn().mockResolvedValue({ id: 'b1' }) } as unknown as jest.Mocked<
      Queue<ReportJobPayload>
    >;
    storage = {
      ensureBucket: jest.fn(),
      putObject: jest.fn(),
      getObject: jest.fn(),
      headObject: jest.fn(),
      deleteObject: jest.fn(),
      presignGetUrl: jest.fn(),
      presignPutUrl: jest.fn(),
    } as unknown as jest.Mocked<ObjectStorage>;

    svc = new ReportsService(prisma, queue, storage);
  });

  describe('generateReport', () => {
    it('creates a PENDING report and enqueues the job', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: ENGAGEMENT_ID });
      (prisma.reportTemplate.findUnique as jest.Mock).mockResolvedValue(makeTemplate());
      (prisma.report.create as jest.Mock).mockResolvedValue(makeReport());

      const result = await svc.generateReport(USER_ID, {
        engagementId: ENGAGEMENT_ID,
        templateSlug: 'json-full-export',
      });

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          engagementId: ENGAGEMENT_ID,
          templateId: 'tpl_1',
          format: ReportFormat.JSON,
          status: ReportStatus.PENDING,
          createdById: USER_ID,
        }),
        include: { template: true },
      });
      expect(queue.add).toHaveBeenCalledWith('report', { reportId: 'rep_1' });
      expect(result.id).toBe('rep_1');
    });

    it('throws NotFoundError when engagement does not belong to user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        svc.generateReport(USER_ID, {
          engagementId: 'eng_missing',
          templateSlug: 'json-full-export',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when templateSlug is unknown', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: ENGAGEMENT_ID });
      (prisma.reportTemplate.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        svc.generateReport(USER_ID, { engagementId: ENGAGEMENT_ID, templateSlug: 'nope' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('marks the report FAILED and rethrows when enqueue fails', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: ENGAGEMENT_ID });
      (prisma.reportTemplate.findUnique as jest.Mock).mockResolvedValue(makeTemplate());
      (prisma.report.create as jest.Mock).mockResolvedValue(makeReport());
      (queue.add as jest.Mock).mockRejectedValueOnce(new Error('redis-down'));

      await expect(
        svc.generateReport(USER_ID, {
          engagementId: ENGAGEMENT_ID,
          templateSlug: 'json-full-export',
        }),
      ).rejects.toThrow('redis-down');

      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: 'rep_1' },
        data: expect.objectContaining({
          status: ReportStatus.FAILED,
          errorMessage: expect.stringContaining('redis-down'),
        }),
      });
    });
  });

  describe('listForOwner', () => {
    it('filters by engagement.ownerId and orders by createdAt desc', async () => {
      (prisma.report.findMany as jest.Mock).mockResolvedValue([]);
      await svc.listForOwner(USER_ID, ENGAGEMENT_ID);
      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            engagementId: ENGAGEMENT_ID,
            engagement: { ownerId: USER_ID, deletedAt: null },
          },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('presignDownloadUrl', () => {
    it('returns null when status is not READY', async () => {
      const result = await svc.presignDownloadUrl(
        makeReport({ status: ReportStatus.GENERATING }) as never,
      );
      expect(result).toBeNull();
      expect(storage.presignGetUrl).not.toHaveBeenCalled();
    });

    it('returns a signed URL when status is READY', async () => {
      (storage.presignGetUrl as jest.Mock).mockResolvedValue(
        'https://minio.local/reports/eng_1/rep_1.json?sig=abc',
      );
      const result = await svc.presignDownloadUrl(
        makeReport({ status: ReportStatus.READY, storageKey: 'eng_1/rep_1.json' }) as never,
      );
      expect(result).toBe('https://minio.local/reports/eng_1/rep_1.json?sig=abc');
      expect(storage.presignGetUrl).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'reports', key: 'eng_1/rep_1.json' }),
      );
    });
  });

  describe('streamDownload', () => {
    it('throws ConflictError when report is not READY', async () => {
      (prisma.report.findFirst as jest.Mock).mockResolvedValue(
        makeReport({ status: ReportStatus.GENERATING }),
      );
      await expect(svc.streamDownload(USER_ID, 'rep_1')).rejects.toBeInstanceOf(ConflictError);
    });

    it('returns a Readable + headers when READY', async () => {
      (prisma.report.findFirst as jest.Mock).mockResolvedValue(
        makeReport({ status: ReportStatus.READY, storageKey: 'eng_1/rep_1.json' }),
      );
      const body = Readable.from(['{"hello":"world"}']);
      (storage.getObject as jest.Mock).mockResolvedValue({
        body,
        contentLength: 17,
        contentType: 'application/json',
      });
      // Service prefers Report.contentType (set when READY); when null we fall back to obj.contentType.
      const reportRow = {
        ...makeReport({ status: ReportStatus.READY, storageKey: 'eng_1/rep_1.json' }),
        contentType: 'application/json',
        sizeBytes: 17,
      };
      (prisma.report.findFirst as jest.Mock).mockResolvedValueOnce(reportRow);

      const out = await svc.streamDownload(USER_ID, 'rep_1');
      expect(out.contentType).toBe('application/json');
      expect(out.sizeBytes).toBe(17);
      expect(out.filename).toBe('report-rep_1.json');
      expect(out.stream).toBe(body);
    });
  });
});
