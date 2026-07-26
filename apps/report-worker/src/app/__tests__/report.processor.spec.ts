import { Test } from '@nestjs/testing';
import { ReportFormat, ReportStatus, Severity } from '@prisma/client';
import type { Job } from 'bullmq';

import { PrismaService } from '@autoscanner/database';
import { OBJECT_STORAGE } from '@autoscanner/storage';
import { PDF_RENDERER } from '@autoscanner/reporting';
import { NotificationEventType, NotificationsFanoutService } from '@autoscanner/notifications';

import { ReportProcessor } from '../report.processor';

const NOW = new Date('2026-06-12T12:00:00Z');

function makeJob(reportId: string): Job<{ reportId: string }> {
  return { data: { reportId }, id: reportId } as unknown as Job<{ reportId: string }>;
}

function makeReport(overrides: Partial<{ format: ReportFormat; templateSource: string }> = {}) {
  return {
    id: 'r-1',
    engagementId: 'eng-1',
    scanId: null,
    templateId: 'tpl-1',
    format: overrides.format ?? ReportFormat.JSON,
    status: ReportStatus.PENDING,
    filters: null,
    storageKey: null,
    sizeBytes: null,
    contentType: null,
    errorMessage: null,
    createdById: 'u-1',
    createdAt: NOW,
    startedAt: null,
    completedAt: null,
    template: {
      id: 'tpl-1',
      slug: 'json-full-export',
      name: 'JSON',
      description: null,
      format: overrides.format ?? ReportFormat.JSON,
      templateSource: overrides.templateSource ?? '',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
  };
}

describe('ReportProcessor', () => {
  let processor: ReportProcessor;
  let prisma: {
    report: { findUnique: jest.Mock; update: jest.Mock };
    engagement: { findUniqueOrThrow: jest.Mock };
    asset: { findMany: jest.Mock };
    finding: { findMany: jest.Mock };
    scan: { findMany: jest.Mock };
    cveCache: { findMany: jest.Mock };
    email: { findMany: jest.Mock };
    orgMetadata: { findMany: jest.Mock };
  };
  let storage: { putObject: jest.Mock };
  let pdf: { renderHtml: jest.Mock };
  let fanout: { fanout: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = {
      report: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      engagement: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'eng-1', name: 'Test Engagement' }),
      },
      asset: { findMany: jest.fn().mockResolvedValue([]) },
      finding: { findMany: jest.fn().mockResolvedValue([]) },
      scan: { findMany: jest.fn().mockResolvedValue([]) },
      cveCache: { findMany: jest.fn().mockResolvedValue([]) },
      email: { findMany: jest.fn().mockResolvedValue([]) },
      orgMetadata: { findMany: jest.fn().mockResolvedValue([]) },
    };
    storage = { putObject: jest.fn().mockResolvedValue({ etag: 'etag-1' }) };
    pdf = { renderHtml: jest.fn().mockResolvedValue(Buffer.from('%PDF-mock')) };
    fanout = { fanout: jest.fn().mockResolvedValue(0) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: OBJECT_STORAGE, useValue: storage },
        { provide: PDF_RENDERER, useValue: pdf },
        { provide: NotificationsFanoutService, useValue: fanout },
      ],
    }).compile();

    processor = moduleRef.get(ReportProcessor);
  });

  afterEach(() => jest.useRealTimers());

  it('throws when the Report row is missing', async () => {
    prisma.report.findUnique.mockResolvedValueOnce(null);
    await expect(processor.process(makeJob('r-missing'))).rejects.toThrow(/not found/);
    expect(prisma.report.update).not.toHaveBeenCalled();
  });

  it('renders a JSON report through GENERATING → READY and uploads to MinIO', async () => {
    prisma.report.findUnique.mockResolvedValueOnce(makeReport({ format: ReportFormat.JSON }));

    await processor.process(makeJob('r-1'));

    expect(prisma.report.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'r-1' },
      data: { status: ReportStatus.GENERATING, startedAt: NOW },
    });
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'reports',
        key: 'eng-1/r-1.json',
        contentType: 'application/json',
      }),
    );
    expect(prisma.report.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'r-1' },
      data: expect.objectContaining({
        status: ReportStatus.READY,
        storageKey: 'eng-1/r-1.json',
        contentType: 'application/json',
        completedAt: NOW,
        errorMessage: null,
      }),
    });

    // Notification fanout fired with REPORT_READY
    expect(fanout.fanout).toHaveBeenCalledWith(
      NotificationEventType.REPORT_READY,
      expect.objectContaining({ engagementId: 'eng-1', reportId: 'r-1' }),
    );
  });

  it('renders a CSV report with text/csv contentType and findings rows', async () => {
    prisma.report.findUnique.mockResolvedValueOnce(makeReport({ format: ReportFormat.CSV }));
    prisma.finding.findMany.mockResolvedValueOnce([
      {
        id: 'f-1',
        severity: Severity.HIGH,
        cveId: 'CVE-2024-1',
        title: 'XSS',
        evidence: { snippet: '<script>' },
        firstSeenAt: NOW,
        lastSeenAt: NOW,
        dedupHash: 'h-1',
        asset: { canonicalValue: 'api.example.com', riskScore: 75 },
      },
    ]);

    await processor.process(makeJob('r-1'));

    const putArgs = storage.putObject.mock.calls[0][0];
    expect(putArgs.contentType).toBe('text/csv');
    expect(putArgs.key).toBe('eng-1/r-1.csv');
    const csv = putArgs.body.toString('utf8');
    expect(csv).toContain('id,engagementId,assetCanonicalValue');
    expect(csv).toContain('f-1');
    expect(csv).toContain('api.example.com');
  });

  it('renders a SARIF report with the proper $schema and rule dedup', async () => {
    prisma.report.findUnique.mockResolvedValueOnce(makeReport({ format: ReportFormat.SARIF }));
    prisma.finding.findMany.mockResolvedValueOnce([
      {
        id: 'f-1',
        severity: Severity.CRITICAL,
        cveId: 'CVE-2024-1',
        title: 'RCE',
        evidence: null,
        firstSeenAt: NOW,
        lastSeenAt: NOW,
        dedupHash: 'h-1',
        asset: { canonicalValue: 'api.example.com' },
      },
    ]);
    prisma.cveCache.findMany.mockResolvedValueOnce([
      { cveId: 'CVE-2024-1', cvssV3Score: 9.8, summary: 'RCE in TLS' },
    ]);

    await processor.process(makeJob('r-1'));

    const putArgs = storage.putObject.mock.calls[0][0];
    expect(putArgs.contentType).toBe('application/sarif+json');
    expect(putArgs.key).toBe('eng-1/r-1.sarif.json');
    const sarif = JSON.parse(putArgs.body.toString('utf8'));
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].results[0].level).toBe('error');
    expect(sarif.runs[0].results[0].message.text).toBe('RCE in TLS');
  });

  it('renders a PDF report by calling PdfRenderer.renderHtml(template)', async () => {
    prisma.report.findUnique.mockResolvedValueOnce(
      makeReport({ format: ReportFormat.PDF, templateSource: '<h1>{{engagement.name}}</h1>' }),
    );

    await processor.process(makeJob('r-1'));

    expect(pdf.renderHtml).toHaveBeenCalledTimes(1);
    expect(pdf.renderHtml.mock.calls[0][0]).toContain('Test Engagement');
    const putArgs = storage.putObject.mock.calls[0][0];
    expect(putArgs.contentType).toBe('application/pdf');
    expect(putArgs.key).toBe('eng-1/r-1.pdf');
  });

  it('renders the OSINT phishing-exposure section into the PDF template', async () => {
    prisma.report.findUnique.mockResolvedValueOnce(
      makeReport({
        format: ReportFormat.PDF,
        templateSource:
          '{{#each phishingExposure}}<tr><td>{{severity}}</td><td>{{domain}}</td><td>{{emailCount}}</td><td>{{join weaknesses}}</td></tr>{{/each}}',
      }),
    );
    prisma.email.findMany.mockResolvedValueOnce([
      { id: 'e-1', address: 'admin@corp.com' },
      { id: 'e-2', address: 'ceo@corp.com' },
    ]);
    prisma.orgMetadata.findMany.mockResolvedValueOnce([
      {
        id: 'o-1',
        data: { domain: 'corp.com', spf: {}, dmarc: { record: 'v=DMARC1', policy: 'none' } },
      },
    ]);

    await processor.process(makeJob('r-1'));

    const html = pdf.renderHtml.mock.calls[0][0] as string;
    expect(html).toContain('HIGH');
    expect(html).toContain('corp.com');
    expect(html).toContain('SPF manquant');
    // Handlebars HTML-escapes the '=' in "DMARC p=none" → assert the stable prefix.
    expect(html).toContain('DMARC p');
  });

  it('marks Report FAILED and rethrows when render throws', async () => {
    prisma.report.findUnique.mockResolvedValueOnce(makeReport({ format: ReportFormat.PDF }));
    pdf.renderHtml.mockRejectedValueOnce(new Error('chromium crashed'));

    await expect(processor.process(makeJob('r-1'))).rejects.toThrow('chromium crashed');

    expect(prisma.report.update).toHaveBeenLastCalledWith({
      where: { id: 'r-1' },
      data: expect.objectContaining({
        status: ReportStatus.FAILED,
        errorMessage: expect.stringContaining('chromium crashed'),
        completedAt: NOW,
      }),
    });
  });
});
