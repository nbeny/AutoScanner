import { NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';

import { DnsRecordsService } from '../dns-records.service';

describe('DnsRecordsService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: DnsRecordsService;
  const userId = 'user_1';
  const engagementId = 'eng_1';

  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn() },
      dnsRecord: { findMany: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    svc = new DnsRecordsService(prisma);
  });

  describe('listForOwner', () => {
    it('returns the dns records for the engagement ordered by lastSeenAt desc', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      const fixture = [
        {
          id: 'd_1',
          domainId: 'dom_1',
          subdomainId: null,
          type: 'A',
          name: 'example.com',
          value: '93.184.216.34',
          ttl: 3600,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        },
      ];
      (prisma.dnsRecord.findMany as jest.Mock).mockResolvedValueOnce(fixture);

      const result = await svc.listForOwner(userId, engagementId);

      expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
        where: { id: engagementId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      expect(result).toBe(fixture);
    });

    it('queries records attached to either a subdomain or a domain via OR clause', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.dnsRecord.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.listForOwner(userId, engagementId);

      expect(prisma.dnsRecord.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ subdomain: { engagementId } }, { domain: { engagementId } }],
        },
        orderBy: { lastSeenAt: 'desc' },
      });
    });

    it('throws NotFoundError when the engagement is not owned by the user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(svc.listForOwner(userId, engagementId)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.dnsRecord.findMany).not.toHaveBeenCalled();
    });

    it('does not call findMany when ownership check fails (engagement undefined)', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(undefined);

      await expect(svc.listForOwner(userId, engagementId)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.dnsRecord.findMany).not.toHaveBeenCalled();
    });
  });
});
