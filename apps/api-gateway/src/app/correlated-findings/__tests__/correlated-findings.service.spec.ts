import { NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';
import { FindingStatus, Severity } from '@prisma/client';

import { CorrelatedFindingsService } from '../correlated-findings.service';

describe('CorrelatedFindingsService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let findingClient: { setStatus: jest.Mock; annotate: jest.Mock };
  let svc: CorrelatedFindingsService;
  const userId = 'user_1';
  const engagementId = 'eng_1';
  const correlatedId = 'cf_1';

  const makeRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: correlatedId,
    assetId: 'asset_1',
    engagementId,
    structuralHash: 'hash_abc',
    category: 'SQLI',
    title: 'SQL Injection',
    severity: Severity.HIGH,
    cveId: null,
    status: FindingStatus.OPEN,
    sourceCount: 2,
    firstSeenAt: new Date('2024-01-01'),
    lastSeenAt: new Date('2024-06-01'),
    findings: [
      { scanJob: { scannerName: 'nuclei' } },
      { scanJob: { scannerName: 'sqlmap' } },
      { scanJob: { scannerName: 'nuclei' } }, // duplicate — should be deduped
    ],
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn() },
      correlatedFinding: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      nvdCve: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      $transaction: jest.fn(),
    } as unknown as jest.Mocked<PrismaService>;
    findingClient = {
      setStatus: jest.fn().mockResolvedValue({ id: correlatedId, status: 'CONFIRMED' }),
      annotate: jest.fn().mockResolvedValue({ id: correlatedId }),
    };
    svc = new CorrelatedFindingsService(prisma, findingClient as never);
  });

  describe('list', () => {
    it('throws NotFoundError and does not call findMany when engagement is not owned', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(svc.list(userId, engagementId)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.correlatedFinding.findMany).not.toHaveBeenCalled();
    });

    it('calls findMany with engagementId, severity desc orderBy, and no extra filters when none given', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.correlatedFinding.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.list(userId, engagementId);

      expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
        where: { id: engagementId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.correlatedFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { engagementId },
          orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
          take: 100,
          skip: 0,
        }),
      );
    });

    it('applies severity filter when provided', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.correlatedFinding.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.list(userId, engagementId, { severity: Severity.CRITICAL });

      expect(prisma.correlatedFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { engagementId, severity: Severity.CRITICAL },
        }),
      );
    });

    it('applies status filter when provided', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.correlatedFinding.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.list(userId, engagementId, { status: FindingStatus.TRIAGED });

      expect(prisma.correlatedFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { engagementId, status: FindingStatus.TRIAGED },
        }),
      );
    });

    it('applies title search filter when search is provided', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.correlatedFinding.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.list(userId, engagementId, { search: 'injection' });

      expect(prisma.correlatedFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { engagementId, title: { contains: 'injection', mode: 'insensitive' } },
        }),
      );
    });

    it('deduplicates scanner names in sources from findings', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.correlatedFinding.findMany as jest.Mock).mockResolvedValueOnce([makeRow()]);

      const result = await svc.list(userId, engagementId);

      expect(result).toHaveLength(1);
      expect(result[0].sources).toEqual(['nuclei', 'sqlmap']);
      expect(result[0].sourceCount).toBe(2);
    });

    it('respects limit and offset options', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.correlatedFinding.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.list(userId, engagementId, { limit: 10, offset: 20 });

      expect(prisma.correlatedFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 }),
      );
    });

    it('computes riskScore and orders the page by it (desc)', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.nvdCve.findMany as jest.Mock).mockResolvedValueOnce([
        { cveId: 'CVE-2024-1', cvssV3Score: 9.8 },
      ]);
      (prisma.correlatedFinding.findMany as jest.Mock).mockResolvedValueOnce([
        makeRow({ id: 'low', severity: Severity.HIGH, cveId: null }), // weight 5
        makeRow({ id: 'high', severity: Severity.LOW, cveId: 'CVE-2024-1' }), // weight 9.8
      ]);

      const result = await svc.list(userId, engagementId);

      expect(result.map((r) => r.id)).toEqual(['high', 'low']);
      expect(result[0].riskScore).toBe(9.8);
      expect(result[1].riskScore).toBe(5);
    });
  });

  describe('setNote / setRemediation', () => {
    beforeEach(() => {
      // First findUnique resolves the engagement for the ownership check.
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: engagementId });
    });

    it('setNote delegates the write to finding-service and returns the mapped DTO', async () => {
      (prisma.correlatedFinding.findUnique as jest.Mock)
        .mockResolvedValueOnce({ engagementId })
        .mockResolvedValueOnce(makeRow({ note: 'confirmed via curl' }));

      const result = await svc.setNote(userId, correlatedId, 'confirmed via curl');

      // api-gateway must not write CorrelatedFinding itself — finding-service is the writer.
      expect(prisma.correlatedFinding.update).not.toHaveBeenCalled();
      expect(findingClient.annotate).toHaveBeenCalledWith({
        correlatedFindingId: correlatedId,
        note: 'confirmed via curl',
      });
      expect(result.id).toBe(correlatedId);
    });

    it('setRemediation delegates the remediation write to finding-service', async () => {
      (prisma.correlatedFinding.findUnique as jest.Mock)
        .mockResolvedValueOnce({ engagementId })
        .mockResolvedValueOnce(makeRow({ remediation: 'Upgrade to 2.5.13' }));

      const result = await svc.setRemediation(userId, correlatedId, 'Upgrade to 2.5.13');

      expect(prisma.correlatedFinding.update).not.toHaveBeenCalled();
      expect(findingClient.annotate).toHaveBeenCalledWith({
        correlatedFindingId: correlatedId,
        remediation: 'Upgrade to 2.5.13',
      });
      expect(result.id).toBe(correlatedId);
    });
  });

  describe('setStatus', () => {
    it('throws NotFoundError when the correlated finding does not exist', async () => {
      (prisma.correlatedFinding.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        svc.setStatus(userId, correlatedId, FindingStatus.CONFIRMED),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.engagement.findFirst).not.toHaveBeenCalled();
      expect(findingClient.setStatus).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the engagement is not owned by the user', async () => {
      (prisma.correlatedFinding.findUnique as jest.Mock).mockResolvedValueOnce({
        engagementId,
      });
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        svc.setStatus(userId, correlatedId, FindingStatus.CONFIRMED),
      ).rejects.toBeInstanceOf(NotFoundError);
      // Authorization fails before the write is delegated: finding-service is never touched.
      expect(findingClient.setStatus).not.toHaveBeenCalled();
    });

    it('delegates the write to finding-service (the single status writer) after the ownership check', async () => {
      // First findUnique resolves the engagement for the ownership check; the second re-reads
      // the row for the GraphQL response after finding-service has committed the change.
      (prisma.correlatedFinding.findUnique as jest.Mock)
        .mockResolvedValueOnce({ engagementId })
        .mockResolvedValueOnce(makeRow({ status: FindingStatus.CONFIRMED }));
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });

      const result = await svc.setStatus(
        userId,
        correlatedId,
        FindingStatus.CONFIRMED,
        'looks real',
      );

      // api-gateway must NOT write the status column itself — that is finding-service's job.
      expect(prisma.correlatedFinding.update).not.toHaveBeenCalled();
      expect(findingClient.setStatus).toHaveBeenCalledWith({
        correlatedFindingId: correlatedId,
        status: FindingStatus.CONFIRMED,
        actorId: userId,
        note: 'looks real',
      });
      expect(result.status).toBe(FindingStatus.CONFIRMED);
    });
  });

  describe('listAllForOwner', () => {
    it('listAllForOwner scopes by owner and applies status filter across engagements', async () => {
      const row = makeRow({ id: 'cf1', status: FindingStatus.OPEN });
      (prisma.correlatedFinding.findMany as jest.Mock).mockResolvedValueOnce([row]);

      const res = await svc.listAllForOwner(userId, {
        status: FindingStatus.OPEN,
        limit: 50,
        offset: 0,
      });

      expect(prisma.correlatedFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: FindingStatus.OPEN,
            engagement: { ownerId: userId, deletedAt: null },
          }),
          take: 50,
          skip: 0,
        }),
      );
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('cf1');
    });

    it('applies engagementId filter when provided', async () => {
      (prisma.correlatedFinding.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.listAllForOwner(userId, { engagementId: 'eng_42' });

      expect(prisma.correlatedFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            engagementId: 'eng_42',
            engagement: { ownerId: userId, deletedAt: null },
          }),
        }),
      );
    });

    it('applies severity filter when provided', async () => {
      (prisma.correlatedFinding.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.listAllForOwner(userId, { severity: Severity.CRITICAL });

      expect(prisma.correlatedFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            severity: Severity.CRITICAL,
            engagement: { ownerId: userId, deletedAt: null },
          }),
        }),
      );
    });

    it('applies title search filter when search is provided', async () => {
      (prisma.correlatedFinding.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.listAllForOwner(userId, { search: 'xss' });

      expect(prisma.correlatedFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            title: { contains: 'xss', mode: 'insensitive' },
            engagement: { ownerId: userId, deletedAt: null },
          }),
        }),
      );
    });

    it('uses default limit 100 and offset 0 when not provided', async () => {
      (prisma.correlatedFinding.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.listAllForOwner(userId);

      expect(prisma.correlatedFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100, skip: 0 }),
      );
    });
  });

  describe('getAssetValue', () => {
    it('getAssetValue returns the asset value', async () => {
      (prisma as any).asset = { findUnique: jest.fn().mockResolvedValue({ value: 'example.com' }) };
      const v = await svc.getAssetValue('a1');
      expect((prisma as any).asset.findUnique).toHaveBeenCalledWith({
        where: { id: 'a1' },
        select: { value: true },
      });
      expect(v).toBe('example.com');
    });
  });

  describe('getDetail', () => {
    it('returns full detail with cvss, evidence, sources, and status history', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.correlatedFinding.findUnique as jest.Mock).mockResolvedValueOnce({
        id: correlatedId,
        engagementId,
        assetId: 'asset_1',
        title: 'RCE',
        severity: Severity.CRITICAL,
        status: FindingStatus.OPEN,
        cveId: 'CVE-2017-5638',
        note: 'check me',
        remediation: null,
        asset: { value: '10.0.0.4' },
        findings: [
          {
            location: '/struts.action',
            evidence: { payload: 'x' },
            scanJob: { scannerName: 'nuclei' },
          },
        ],
        statusEvents: [
          {
            id: 'ev_1',
            fromStatus: FindingStatus.OPEN,
            toStatus: FindingStatus.TRIAGED,
            note: null,
            createdAt: new Date('2026-06-10'),
            actor: { displayName: 'Op', email: 'op@x.io' },
          },
        ],
      });
      (prisma.nvdCve.findUnique as jest.Mock).mockResolvedValueOnce({
        cvssV3Score: 9.8,
        cvssV3Vector: 'AV:N/...',
      });

      const d = await svc.getDetail(userId, correlatedId);

      expect(d.cvssScore).toBe(9.8);
      expect(d.assetValue).toBe('10.0.0.4');
      expect(d.sources).toEqual(['nuclei']);
      expect(d.evidence[0].evidenceJson).toBe(JSON.stringify({ payload: 'x' }));
      expect(d.statusHistory[0].actor).toBe('Op');
      expect(d.riskScore).toBe(9.8);
    });

    it('throws NotFoundError when the cluster does not exist', async () => {
      (prisma.correlatedFinding.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(svc.getDetail(userId, correlatedId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
