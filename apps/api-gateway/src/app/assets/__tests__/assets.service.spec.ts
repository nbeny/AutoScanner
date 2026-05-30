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
    it('defaults to including ports and technologies when no opts are passed (back-compat)', async () => {
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

    it('skips the ports/technologies includes when both flags are false', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.asset.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.listForOwner(userId, engagementId, {
        includePorts: false,
        includeTechnologies: false,
      });

      expect(prisma.asset.findMany).toHaveBeenCalledWith({
        where: { engagementId, deletedAt: null },
        orderBy: { lastSeenAt: 'desc' },
        include: {},
      });
    });

    it('skips only the unrequested relation (ports false, technologies true)', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.asset.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.listForOwner(userId, engagementId, {
        includePorts: false,
        includeTechnologies: true,
      });

      expect(prisma.asset.findMany).toHaveBeenCalledWith({
        where: { engagementId, deletedAt: null },
        orderBy: { lastSeenAt: 'desc' },
        include: { technologies: true },
      });
    });

    it('applies a type filter via `{ type: { in: [...] } }` when types is non-empty', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.asset.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.listForOwner(userId, engagementId, {
        types: ['DOMAIN', 'SUBDOMAIN'] as never,
        includePorts: false,
        includeTechnologies: false,
      });

      expect(prisma.asset.findMany).toHaveBeenCalledWith({
        where: {
          engagementId,
          deletedAt: null,
          type: { in: ['DOMAIN', 'SUBDOMAIN'] },
        },
        orderBy: { lastSeenAt: 'desc' },
        include: {},
      });
    });

    it('omits the type filter when types is an empty array (treats as "no filter")', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.asset.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.listForOwner(userId, engagementId, { types: [] });

      const call = (prisma.asset.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).not.toHaveProperty('type');
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
