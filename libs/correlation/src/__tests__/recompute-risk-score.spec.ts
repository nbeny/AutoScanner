import type { PrismaClient } from '@prisma/client';
import { recomputeRiskScoreForAsset } from '../recompute-risk-score';

describe('recomputeRiskScoreForAsset', () => {
  it('throws when the asset is not found', async () => {
    const prisma = {
      asset: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    } as unknown as PrismaClient;

    await expect(recomputeRiskScoreForAsset(prisma, 'missing')).rejects.toThrow(
      /Asset not found: missing/,
    );
    expect((prisma.asset as unknown as { update: jest.Mock }).update).not.toHaveBeenCalled();
  });

  it('writes the computed score back to Asset.riskScore', async () => {
    const prisma = {
      asset: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'a1',
          findings: [{ severity: 'CRITICAL', cveId: 'CVE-2024-1' }],
          ports: [{ number: 22, state: 'OPEN', services: [{ name: 'ssh', product: null }] }],
        }),
        update: jest.fn().mockResolvedValue({ id: 'a1' }),
      },
    } as unknown as PrismaClient;

    const score = await recomputeRiskScoreForAsset(prisma, 'a1');

    expect(score).toBe(10 + 2 + 1); // crit + sensitive port + cve
    expect((prisma.asset as unknown as { update: jest.Mock }).update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { riskScore: 13 },
    });
  });

  it('queries findings (severity, cveId) and ports.services (name, product) and ports.state/number', () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'a1',
      findings: [],
      ports: [],
    });
    const prisma = {
      asset: { findUnique, update: jest.fn().mockResolvedValue({ id: 'a1' }) },
    } as unknown as PrismaClient;

    return recomputeRiskScoreForAsset(prisma, 'a1').then(() => {
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'a1' },
        select: {
          id: true,
          findings: { select: { severity: true, cveId: true } },
          ports: {
            select: {
              number: true,
              state: true,
              services: { select: { name: true, product: true } },
            },
          },
        },
      });
    });
  });
});
