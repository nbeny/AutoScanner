import { ReportFormat, ReportStatus } from '@prisma/client';

import { ReportsResolver } from '../reports.resolver';
import type { ReportsService } from '../reports.service';

const USER = { id: 'user_1' } as never;

function fakeReport() {
  return {
    id: 'rep_1',
    engagementId: 'eng_1',
    scanId: null,
    templateId: 'tpl_1',
    format: ReportFormat.JSON,
    status: ReportStatus.PENDING,
    filters: null,
    storageKey: null,
    sizeBytes: null,
    contentType: null,
    errorMessage: null,
    createdById: 'user_1',
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    template: {
      id: 'tpl_1',
      slug: 'json-full-export',
      name: 'JSON',
      description: null,
      format: ReportFormat.JSON,
      isDefault: true,
    },
  };
}

describe('ReportsResolver', () => {
  let svc: jest.Mocked<ReportsService>;
  let resolver: ReportsResolver;

  beforeEach(() => {
    svc = {
      generateReport: jest.fn(),
      listForOwner: jest.fn(),
      getForOwner: jest.fn(),
      listTemplates: jest.fn(),
      presignDownloadUrl: jest.fn(),
    } as unknown as jest.Mocked<ReportsService>;
    resolver = new ReportsResolver(svc);
  });

  it('delegates generateReport to the service', async () => {
    const report = fakeReport();
    svc.generateReport.mockResolvedValue(report as never);
    const input = { engagementId: 'eng_1', templateSlug: 'json-full-export' };

    const out = await resolver.generateReport(USER, input);

    expect(svc.generateReport).toHaveBeenCalledWith('user_1', input);
    expect(out).toBe(report);
  });

  it('delegates reports query to listForOwner', async () => {
    svc.listForOwner.mockResolvedValue([]);
    await resolver.reports(USER, 'eng_1');
    expect(svc.listForOwner).toHaveBeenCalledWith('user_1', 'eng_1');
  });

  it('resolves downloadUrl via the service', async () => {
    svc.presignDownloadUrl.mockResolvedValue('https://minio.local/x?sig=1');
    const out = await resolver.downloadUrl(fakeReport() as never);
    expect(svc.presignDownloadUrl).toHaveBeenCalled();
    expect(out).toBe('https://minio.local/x?sig=1');
  });
});
