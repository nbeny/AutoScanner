import { NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';

import { AssetsService } from '../assets.service';

describe('AssetsService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: AssetsService;
  const userId = 'user_1';
  const engagementId = 'eng_1';

  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn() },
      asset: { findMany: jest.fn(), findFirst: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    svc = new AssetsService(prisma);
  });

  describe('listForOwner', () => {
    it('returns the engagement assets with nested ports and services', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      const fixture = [
        {
          id: 'asset_1',
          engagementId,
          type: 'IP_ADDRESS',
          value: '127.0.0.1',
          canonicalValue: '127.0.0.1',
          ports: [{ id: 'port_1', number: 80, protocol: 'TCP', state: 'OPEN', services: [] }],
        },
      ];
      (prisma.asset.findMany as jest.Mock).mockResolvedValueOnce(fixture);

      const result = await svc.listForOwner(userId, engagementId);

      expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
        where: { id: engagementId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.asset.findMany).toHaveBeenCalledWith({
        where: { engagementId, deletedAt: null },
        orderBy: { lastSeenAt: 'desc' },
        include: { ports: { include: { services: true } }, technologies: true },
      });
      expect(result).toBe(fixture);
    });

    it('throws NotFoundError when the engagement is not owned by the user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(svc.listForOwner(userId, engagementId)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.asset.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getForOwner', () => {
    it('returns the asset including ports and services when the engagement chain is owned', async () => {
      const fixture = {
        id: 'asset_1',
        engagementId,
        type: 'DOMAIN',
        value: 'example.com',
        canonicalValue: 'example.com',
        ports: [],
      };
      (prisma.asset.findFirst as jest.Mock).mockResolvedValueOnce(fixture);

      const result = await svc.getForOwner(userId, 'asset_1');

      expect(prisma.asset.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'asset_1',
          deletedAt: null,
          engagement: { ownerId: userId, deletedAt: null },
        },
        include: { ports: { include: { services: true } }, technologies: true },
      });
      expect(result).toBe(fixture);
    });

    it('throws NotFoundError when the asset does not exist or is not owned', async () => {
      (prisma.asset.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(svc.getForOwner(userId, 'asset_x')).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
