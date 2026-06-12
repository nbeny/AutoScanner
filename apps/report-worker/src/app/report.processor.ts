import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  ReportFormat,
  ReportStatus,
  type Finding,
  type Report,
  type ReportTemplate,
} from '@prisma/client';

import { PrismaService } from '@autoscanner/database';
import { QueueName, type ReportJobPayload } from '@autoscanner/queues';
import { OBJECT_STORAGE, type ObjectStorage } from '@autoscanner/storage';
import {
  CsvRenderer,
  JsonExporter,
  PDF_RENDERER,
  type PdfRenderer,
  type ReportContext,
  SarifBuilder,
  type SarifFindingInput,
  TemplateEngine,
} from '@autoscanner/reporting';

const FORMAT_META: Record<ReportFormat, { ext: string; contentType: string }> = {
  PDF: { ext: 'pdf', contentType: 'application/pdf' },
  CSV: { ext: 'csv', contentType: 'text/csv' },
  SARIF: { ext: 'sarif.json', contentType: 'application/sarif+json' },
  JSON: { ext: 'json', contentType: 'application/json' },
};

const FINDING_CSV_COLUMNS = [
  'id',
  'engagementId',
  'assetCanonicalValue',
  'severity',
  'cveId',
  'cvssV3Score',
  'title',
  'evidence',
  'firstSeenAt',
  'lastSeenAt',
];

const TOOL_VERSION = '0.1.0';

@Processor(QueueName.REPORT_JOBS)
@Injectable()
export class ReportProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportProcessor.name);
  private readonly templateEngine = new TemplateEngine();
  private readonly csvRenderer = new CsvRenderer();
  private readonly sarifBuilder = new SarifBuilder();
  private readonly jsonExporter = new JsonExporter();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(PDF_RENDERER) private readonly pdfRenderer: PdfRenderer,
  ) {
    super();
  }

  async process(job: Job<ReportJobPayload>): Promise<void> {
    const { reportId } = job.data;
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: { template: true },
    });
    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    await this.prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.GENERATING, startedAt: new Date() },
    });

    try {
      const ctx = await this.loadContext(report);
      const { body, sizeBytes } = await this.render(report, report.template, ctx);
      const meta = FORMAT_META[report.format];
      const storageKey = `${report.engagementId}/${report.id}.${meta.ext}`;
      await this.storage.putObject({
        bucket: 'reports',
        key: storageKey,
        body,
        contentType: meta.contentType,
        contentLength: sizeBytes,
      });
      await this.prisma.report.update({
        where: { id: reportId },
        data: {
          status: ReportStatus.READY,
          storageKey,
          sizeBytes,
          contentType: meta.contentType,
          completedAt: new Date(),
          errorMessage: null,
        },
      });
      this.logger.log(`Report ${reportId} READY (${sizeBytes} bytes, key=${storageKey})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Report ${reportId} FAILED: ${message}`);
      await this.prisma.report.update({
        where: { id: reportId },
        data: {
          status: ReportStatus.FAILED,
          errorMessage: message.slice(0, 500),
          completedAt: new Date(),
        },
      });
      throw err;
    }
  }

  private async loadContext(report: Report): Promise<ReportContext> {
    const engagement = await this.prisma.engagement.findUniqueOrThrow({
      where: { id: report.engagementId },
    });
    const assets = await this.prisma.asset.findMany({
      where: { engagementId: report.engagementId, deletedAt: null },
      include: { ports: true, technologies: true },
    });
    const findings = await this.prisma.finding.findMany({
      where: { asset: { engagementId: report.engagementId, deletedAt: null } },
      include: { asset: { select: { canonicalValue: true, riskScore: true } } },
      orderBy: { severity: 'desc' },
    });
    const cveIds = Array.from(
      new Set(findings.map((f) => f.cveId).filter((id): id is string => id != null)),
    );
    const cveRows = cveIds.length
      ? await this.prisma.cveCache.findMany({
          where: { cveId: { in: cveIds }, fetchStatus: 'OK' },
          select: { cveId: true, cvssV3Score: true, summary: true },
        })
      : [];
    const cveById = new Map(cveRows.map((c) => [c.cveId, c]));
    const findingsWithCvss = findings.map((f) => {
      const cve = f.cveId ? cveById.get(f.cveId) : undefined;
      return {
        ...f,
        cvssV3Score: cve?.cvssV3Score ?? null,
        cveSummary: cve?.summary ?? null,
      };
    });
    const scans = await this.prisma.scan.findMany({
      where: { engagementId: report.engagementId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      engagement: engagement as unknown as Record<string, unknown>,
      assets,
      findings: findingsWithCvss,
      scans,
      generatedAt: new Date().toISOString(),
    };
  }

  private async render(
    report: Report,
    template: ReportTemplate,
    ctx: ReportContext,
  ): Promise<{ body: Buffer; sizeBytes: number }> {
    switch (report.format) {
      case ReportFormat.PDF: {
        const html = this.templateEngine.render(template.templateSource, ctx);
        const pdf = await this.pdfRenderer.renderHtml(html, { format: 'A4' });
        return { body: pdf, sizeBytes: pdf.length };
      }
      case ReportFormat.CSV: {
        const rows = ((ctx.findings ?? []) as unknown[]).map((f) => {
          const finding = f as Finding & {
            asset?: { canonicalValue?: string };
            cvssV3Score?: number | null;
          };
          return {
            id: finding.id,
            engagementId: report.engagementId,
            assetCanonicalValue: finding.asset?.canonicalValue ?? '',
            severity: finding.severity,
            cveId: finding.cveId ?? '',
            cvssV3Score: finding.cvssV3Score ?? '',
            title: finding.title,
            evidence: finding.evidence == null ? '' : JSON.stringify(finding.evidence),
            firstSeenAt:
              finding.firstSeenAt instanceof Date ? finding.firstSeenAt.toISOString() : '',
            lastSeenAt: finding.lastSeenAt instanceof Date ? finding.lastSeenAt.toISOString() : '',
          };
        });
        const csv = this.csvRenderer.render(rows, FINDING_CSV_COLUMNS);
        const buf = Buffer.from(csv, 'utf8');
        return { body: buf, sizeBytes: buf.length };
      }
      case ReportFormat.SARIF: {
        const findings = (ctx.findings ?? []) as unknown[];
        const inputs: SarifFindingInput[] = findings.map((f) => {
          const finding = f as Finding & {
            asset?: { canonicalValue?: string };
            cveSummary?: string | null;
          };
          return {
            ruleId: finding.cveId ?? finding.dedupHash ?? finding.id,
            severity: finding.severity,
            title: finding.title,
            description: finding.cveSummary ?? undefined,
            assetCanonicalValue: finding.asset?.canonicalValue,
            cveId: finding.cveId,
          };
        });
        const sarif = this.sarifBuilder.build(inputs, TOOL_VERSION);
        const buf = Buffer.from(JSON.stringify(sarif, null, 2), 'utf8');
        return { body: buf, sizeBytes: buf.length };
      }
      case ReportFormat.JSON: {
        const buf = Buffer.from(this.jsonExporter.serialize(ctx), 'utf8');
        return { body: buf, sizeBytes: buf.length };
      }
      default: {
        throw new Error(`Unsupported report format: ${report.format}`);
      }
    }
  }
}
