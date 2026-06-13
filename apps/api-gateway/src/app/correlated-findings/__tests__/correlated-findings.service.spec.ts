import { NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';
import { FindingStatus, Severity } from '@prisma/client';

import { CorrelatedFindingsService } from '../correlated-findings.service';

describe('CorrelatedFindingsService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: CorrelatedFindingsService;
  const userId = 'user_1';
  const engagementId = 'eng_1';
  const correlatedId = 'cf_1';

  const makeRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: correlatedId,
    assetId: 'asset_1',
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
    } as unknown as jest.Mocked<PrismaService>;
    svc = new CorrelatedFindingsService(prisma);
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
  });

  describe('setStatus', () => {
    it('throws NotFoundError when the correlated finding does not exist', async () => {
      (prisma.correlatedFinding.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        svc.setStatus(userId, correlatedId, FindingStatus.CONFIRMED),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.engagement.findFirst).not.toHaveBeenCalled();
      expect(prisma.correlatedFinding.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the engagement is not owned by the user', async () => {
      (prisma.correlatedFinding.findUnique as jest.Mock).mockResolvedValueOnce({
        engagementId,
      });
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        svc.setStatus(userId, correlatedId, FindingStatus.CONFIRMED),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.correlatedFinding.update).not.toHaveBeenCalled();
    });

    it('updates status and returns a mapped DTO on happy path', async () => {
      (prisma.correlatedFinding.findUnique as jest.Mock).mockResolvedValueOnce({ engagementId });
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      const updatedRow = makeRow({ status: FindingStatus.CONFIRMED });
      (prisma.correlatedFinding.update as jest.Mock).mockResolvedValueOnce(updatedRow);

      const result = await svc.setStatus(userId, correlatedId, FindingStatus.CONFIRMED);

      expect(prisma.correlatedFinding.update).toHaveBeenCalledWith({
        where: { id: correlatedId },
        data: { status: FindingStatus.CONFIRMED },
        include: {
          findings: {
            select: {
              scanJob: { select: { scannerName: true } },
            },
          },
        },
      });
      expect(result.status).toBe(FindingStatus.CONFIRMED);
      expect(result.sources).toEqual(['nuclei', 'sqlmap']);
      expect(result.id).toBe(correlatedId);
    });
  });
});
