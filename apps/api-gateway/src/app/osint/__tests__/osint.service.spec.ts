import { NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';

import type { ScansService } from '../../scans/scans.service';
import { OsintService } from '../osint.service';

describe('OsintService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let scans: jest.Mocked<Pick<ScansService, 'runScan'>>;
  let svc: OsintService;
  const userId = 'user_1';
  const engagementId = 'eng_1';

  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn() },
      email: { findMany: jest.fn() },
      orgMetadata: { findMany: jest.fn() },
      identity: { findMany: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    scans = { runScan: jest.fn() };
    svc = new OsintService(prisma, scans as unknown as ScansService);
  });

  describe('emails', () => {
    it('throws NotFoundError when the engagement is not owned by the user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(svc.emails(userId, engagementId)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.email.findMany).not.toHaveBeenCalled();
    });

    it('calls email.findMany with engagementId filter and lastSeenAt desc order', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      const fixture = [
        {
          id: 'em_1',
          engagementId,
          address: 'admin@example.com',
          source: 'whois',
          firstSeenAt: new Date('2026-05-01'),
          lastSeenAt: new Date('2026-05-02'),
        },
      ];
      (prisma.email.findMany as jest.Mock).mockResolvedValueOnce(fixture);

      const result = await svc.emails(userId, engagementId);

      expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
        where: { id: engagementId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      expect(prisma.email.findMany).toHaveBeenCalledWith({
        where: { engagementId },
        orderBy: { lastSeenAt: 'desc' },
      });
      expect(result).toBe(fixture);
    });
  });

  describe('orgMetadata', () => {
    it('throws NotFoundError when the engagement is not owned by the user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(svc.orgMetadata(userId, engagementId)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.orgMetadata.findMany).not.toHaveBeenCalled();
    });

    it('calls orgMetadata.findMany with engagementId filter and lastSeenAt desc order', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      const fixture = [
        {
          id: 'om_1',
          engagementId,
          kind: 'WHOIS',
          data: { registrant: 'Example Corp' },
          source: 'whois',
          firstSeenAt: new Date('2026-05-01'),
          lastSeenAt: new Date('2026-05-02'),
        },
      ];
      (prisma.orgMetadata.findMany as jest.Mock).mockResolvedValueOnce(fixture);

      const result = await svc.orgMetadata(userId, engagementId);

      expect(prisma.orgMetadata.findMany).toHaveBeenCalledWith({
        where: { engagementId },
        orderBy: { lastSeenAt: 'desc' },
      });
      expect(result).toBe(fixture);
    });
  });

  describe('identities', () => {
    it('throws NotFoundError when the engagement is not owned by the user', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(svc.identities(userId, engagementId)).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.identity.findMany).not.toHaveBeenCalled();
    });

    it('filters by engagement only when no seed is given', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.identity.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.identities(userId, engagementId);

      expect(prisma.identity.findMany).toHaveBeenCalledWith({
        where: { engagementId },
        orderBy: { lastSeenAt: 'desc' },
      });
    });

    it('adds the seed filter when a seed is given', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (prisma.identity.findMany as jest.Mock).mockResolvedValueOnce([]);

      await svc.identities(userId, engagementId, 'alice');

      expect(prisma.identity.findMany).toHaveBeenCalledWith({
        where: { engagementId, seed: 'alice' },
        orderBy: { lastSeenAt: 'desc' },
      });
    });
  });

  describe('runOsintScan', () => {
    it('throws NotFoundError when the engagement is not owned', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        svc.runOsintScan(userId, { engagementId, seed: 'corp.com', seedType: 'DOMAIN' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(scans.runScan).not.toHaveBeenCalled();
    });

    it('fans out the EMAIL preset, sending the local-part to maigret', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (scans.runScan as jest.Mock).mockImplementation(async () => ({ id: 'scan_x' }));

      const result = await svc.runOsintScan(userId, {
        engagementId,
        seed: 'alice@corp.com',
        seedType: 'EMAIL',
      });

      const calls = (scans.runScan as jest.Mock).mock.calls.map((c) => c[1]);
      expect(calls).toEqual([
        { engagementId, scannerName: 'holehe', target: 'alice@corp.com', optionsJson: '' },
        { engagementId, scannerName: 'emailrep', target: 'alice@corp.com', optionsJson: '' },
        { engagementId, scannerName: 'maigret', target: 'alice', optionsJson: '' },
      ]);
      expect(result.count).toBe(3);
      expect(result.seedType).toBe('EMAIL');
      expect(result.launches).toHaveLength(3);
    });

    it('trims the seed and dispatches the USERNAME preset', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (scans.runScan as jest.Mock).mockResolvedValue({ id: 'scan_y' });

      const result = await svc.runOsintScan(userId, {
        engagementId,
        seed: '  neo  ',
        seedType: 'USERNAME',
      });

      expect(scans.runScan).toHaveBeenCalledTimes(1);
      expect((scans.runScan as jest.Mock).mock.calls[0][1]).toEqual({
        engagementId,
        scannerName: 'maigret',
        target: 'neo',
        optionsJson: '',
      });
      expect(result.seed).toBe('neo');
    });
  });
});
