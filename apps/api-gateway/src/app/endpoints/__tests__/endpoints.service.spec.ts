import { NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';

import { EndpointsService } from '../endpoints.service';

describe('EndpointsService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: EndpointsService;
  const userId = 'user_1';
  const engagementId = 'eng_1';

  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn() },
      endpoint: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;
    svc = new EndpointsService(prisma);
  });

  describe('list', () => {
    it('throws NotFoundError when the engagement is not owned by the user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(svc.list(userId, engagementId, {})).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.endpoint.findMany).not.toHaveBeenCalled();
    });

    it('calls endpoint.findMany with engagementId filter and lastSeenAt desc order', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      const fixture = [
        {
          id: 'ep_1',
          engagementId,
          url: 'https://example.com/api',
          canonicalUrl: 'https://example.com/api',
          method: 'GET',
          statusCode: 200,
          contentLength: 512,
          source: 'nuclei',
          firstSeenAt: new Date('2026-05-01'),
          lastSeenAt: new Date('2026-05-02'),
        },
      ];
      (prisma.endpoint.findMany as jest.Mock).mockResolvedValueOnce(fixture);

      const result = await svc.list(userId, engagementId, {});

      expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
        where: { id: engagementId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.endpoint.findMany).toHaveBeenCalledWith({
        where: { engagementId },
        orderBy: { lastSeenAt: 'desc' },
        take: 100,
        skip: 0,
      });
      expect(result).toBe(fixture);
    });

    it('applies subdomainId filter when provided', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.endpoint.findMany as jest.Mock).mockResolvedValueOnce([]);
      const subdomainId = 'sub_1';

      await svc.list(userId, engagementId, { subdomainId });

      expect(prisma.endpoint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { engagementId, subdomainId },
        }),
      );
    });

    it('applies search filter on canonicalUrl when provided', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.endpoint.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.list(userId, engagementId, { search: 'login' });

      expect(prisma.endpoint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            engagementId,
            canonicalUrl: { contains: 'login', mode: 'insensitive' },
          },
        }),
      );
    });

    it('applies both subdomainId and search filters when provided', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.endpoint.findMany as jest.Mock).mockResolvedValueOnce([]);
      const subdomainId = 'sub_2';

      await svc.list(userId, engagementId, { subdomainId, search: 'api' });

      expect(prisma.endpoint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            engagementId,
            subdomainId,
            canonicalUrl: { contains: 'api', mode: 'insensitive' },
          },
        }),
      );
    });

    it('passes limit and offset through to findMany', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.endpoint.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.list(userId, engagementId, { limit: 50, offset: 25 });

      expect(prisma.endpoint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, skip: 25 }),
      );
    });

    it('defaults limit to 100 and offset to 0 when not provided', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.endpoint.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.list(userId, engagementId, {});

      expect(prisma.endpoint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100, skip: 0 }),
      );
    });
  });

  describe('count', () => {
    it('throws NotFoundError when the engagement is not owned by the user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(svc.count(userId, engagementId)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.endpoint.count).not.toHaveBeenCalled();
    });

    it('returns the prisma count when the engagement is owned', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.endpoint.count as jest.Mock).mockResolvedValueOnce(42);

      const result = await svc.count(userId, engagementId);

      expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
        where: { id: engagementId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.endpoint.count).toHaveBeenCalledWith({ where: { engagementId } });
      expect(result).toBe(42);
    });
  });
});
