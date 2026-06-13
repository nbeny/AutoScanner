import { NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';

import { TlsService } from '../tls.service';

describe('TlsService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: TlsService;
  const userId = 'user_1';
  const engagementId = 'eng_1';

  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn() },
      tlsCertificate: { findMany: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    svc = new TlsService(prisma);
  });

  describe('tlsCertificates', () => {
    it('throws NotFoundError when the engagement is not owned by the user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(svc.tlsCertificates(userId, engagementId)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.tlsCertificate.findMany).not.toHaveBeenCalled();
    });

    it('calls tlsCertificate.findMany with engagementId filter and lastSeenAt desc order', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      const fixture = [
        {
          id: 'cert_1',
          engagementId,
          host: 'example.com',
          subjectCn: 'example.com',
          subjectAn: ['example.com', 'www.example.com'],
          issuerCn: "Let's Encrypt",
          notBefore: new Date('2026-01-01'),
          notAfter: new Date('2026-04-01'),
          fingerprintSha256: 'abc123',
          tlsVersion: 'TLSv1.3',
          selfSigned: false,
          expired: false,
          source: 'tlsx',
          firstSeenAt: new Date('2026-05-01'),
          lastSeenAt: new Date('2026-05-02'),
        },
      ];
      (prisma.tlsCertificate.findMany as jest.Mock).mockResolvedValueOnce(fixture);

      const result = await svc.tlsCertificates(userId, engagementId);

      expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
        where: { id: engagementId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.tlsCertificate.findMany).toHaveBeenCalledWith({
        where: { engagementId },
        orderBy: { lastSeenAt: 'desc' },
      });
      expect(result).toBe(fixture);
    });
  });
});
