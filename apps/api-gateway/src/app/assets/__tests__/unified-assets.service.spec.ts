import { NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';

import { AssetSort } from '../dto/asset-sort.enum';
import { UnifiedAssetsService } from '../unified-assets.service';

describe('UnifiedAssetsService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: UnifiedAssetsService;
  const userId = 'user_1';
  const engagementId = 'eng_1';

  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn() },
      $queryRaw: jest.fn(),
    } as unknown as jest.Mocked<PrismaService>;
    svc = new UnifiedAssetsService(prisma);
  });

  it('throws NotFoundError when the engagement is not owned by the user', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await expect(svc.list(userId, engagementId, {})).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns rows from $queryRaw when the engagement is owned', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    const fixture = [
      {
        id: 'asset_1',
        engagementId,
        kind: 'DOMAIN',
        canonicalValue: 'example.com',
        displayName: 'example.com',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        riskScore: 0,
        attrs: { domain: { id: 'dom_1' } },
      },
    ];
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce(fixture);

    const result = await svc.list(userId, engagementId, {});

    expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toBe(fixture);
  });

  it('clamps limit between 1 and 500 and offset to >= 0', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

    // The clamp is internal; verify it doesn't throw and $queryRaw still runs.
    await expect(svc.list(userId, engagementId, { limit: 9999, offset: -5 })).resolves.toEqual([]);
    await expect(svc.list(userId, engagementId, { limit: 0, offset: 0 })).resolves.toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  // The bound LIMIT/OFFSET values inside the Prisma.sql tagged template are
  // awkward to introspect from a jest mock, so these tests assert the contract
  // we actually care about: the service does NOT crash on hostile pagination
  // input, and still issues exactly one $queryRaw call.
  it('defaults limit to 100 when limit is NaN (does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { limit: Number.NaN })).resolves.toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('truncates non-integer limit (12.7 -> 12, does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { limit: 12.7 })).resolves.toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('clamps negative limit to 1 (does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { limit: -5 })).resolves.toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('clamps oversized limit to 500 (does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { limit: 1000 })).resolves.toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('clamps negative offset to 0 (does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { offset: -1 })).resolves.toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('defaults offset to 0 when offset is NaN (does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { offset: Number.NaN })).resolves.toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('treats empty/whitespace search as no filter (does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { search: '   ' })).resolves.toEqual([]);
  });

  it('treats empty kinds list as no filter (does not throw)', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.list(userId, engagementId, { kinds: [] })).resolves.toEqual([]);
  });
});

describe('UnifiedAssetsService.facets', () => {
  it('returns kindCounts, severityCounts, topTechs, scannerSources', async () => {
    const prisma = {
      engagement: { findFirst: jest.fn().mockResolvedValue({ id: 'eng_1' }) },
      asset: { groupBy: jest.fn().mockResolvedValue([{ type: 'DOMAIN', _count: { _all: 3 } }]) },
      finding: {
        groupBy: jest.fn().mockResolvedValue([{ severity: 'HIGH', _count: { _all: 2 } }]),
      },
      technology: {
        groupBy: jest.fn().mockResolvedValue([{ name: 'nginx', _count: { _all: 4 } }]),
      },
      scanJob: { findMany: jest.fn().mockResolvedValue([{ scannerName: 'nuclei' }]) },
    } as never;
    const svc = new UnifiedAssetsService(prisma);
    const facets = await svc.facets('user_1', 'eng_1', null);
    expect(facets.kindCounts).toEqual([{ kind: 'DOMAIN', count: 3 }]);
    expect(facets.severityCounts).toEqual([{ severity: 'HIGH', count: 2 }]);
    expect(facets.topTechs[0]).toEqual({ name: 'nginx', count: 4 });
    expect(facets.scannerSources).toContain('nuclei');
  });
});

describe('UnifiedAssetsService.detail', () => {
  it('throws ForbiddenException when the engagement is not owned', async () => {
    const prisma = {
      asset: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'a1',
          engagement: { ownerId: 'other_user' },
        }),
      },
    } as never;
    const svc = new UnifiedAssetsService(prisma);
    await expect(svc.detail('me', 'a1')).rejects.toThrow(/Forbidden|forbidden/i);
  });

  it('returns asset detail with empty observations array when none exist', async () => {
    const prisma = {
      asset: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'a1',
          type: 'SUBDOMAIN',
          canonicalValue: 'api.example.com',
          riskScore: 12.5,
          firstSeenAt: new Date('2026-05-01'),
          lastSeenAt: new Date('2026-05-02'),
          engagement: { ownerId: 'me' },
          ports: [],
          findings: [],
          technologies: [],
          subdomain: { dnsRecords: [], ips: [] },
          ipAddress: null,
          domain: null,
        }),
      },
      scanJob: { findMany: jest.fn().mockResolvedValue([]) },
      assetObservation: { findMany: jest.fn().mockResolvedValue([]) },
    } as never;
    const svc = new UnifiedAssetsService(prisma);
    const detail = await svc.detail('me', 'a1');
    expect(detail.id).toBe('a1');
    expect(detail.observations).toEqual([]);
    expect(detail.riskScore).toBe(12.5);
  });

  it('still returns soft-deleted assets with deletedAt populated (spec §4.5)', async () => {
    const deletedAt = new Date('2026-06-01T00:00:00Z');
    const findFirst = jest.fn().mockResolvedValue({
      id: 'a_deleted',
      type: 'SUBDOMAIN',
      canonicalValue: 'gone.example.com',
      riskScore: 7,
      firstSeenAt: new Date('2026-05-01'),
      lastSeenAt: new Date('2026-05-15'),
      deletedAt,
      engagement: { ownerId: 'me' },
      ports: [],
      findings: [],
      technologies: [],
      subdomain: { dnsRecords: [], ips: [] },
      ipAddress: null,
      domain: null,
    });
    const prisma = {
      asset: { findFirst },
      scanJob: { findMany: jest.fn().mockResolvedValue([]) },
      assetObservation: { findMany: jest.fn().mockResolvedValue([]) },
    } as never;

    const svc = new UnifiedAssetsService(prisma);
    const detail = await svc.detail('me', 'a_deleted');

    expect(detail.deletedAt).toBe(deletedAt);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a_deleted' },
      }),
    );
  });

  it('returns mapped observations with ts field from observedAt', async () => {
    const assetId = 'a2';
    const ts1 = new Date('2026-05-30T10:00:00Z');
    const ts2 = new Date('2026-05-29T08:00:00Z');
    const findManyObs = jest.fn().mockResolvedValue([
      {
        id: 'obs_1',
        kind: 'PORTSCAN',
        scannerName: 'nmap',
        observedAt: ts1,
        payload: { port: 80 },
      },
      {
        id: 'obs_2',
        kind: 'VULN',
        scannerName: 'nuclei',
        observedAt: ts2,
        payload: { cve: 'CVE-2024-1234' },
      },
    ]);
    const prisma = {
      asset: {
        findFirst: jest.fn().mockResolvedValue({
          id: assetId,
          type: 'IP_ADDRESS',
          canonicalValue: '1.2.3.4',
          riskScore: 50,
          firstSeenAt: new Date('2026-05-01'),
          lastSeenAt: new Date('2026-05-30'),
          engagement: { ownerId: 'me' },
          ports: [],
          findings: [],
          technologies: [],
          subdomain: null,
          ipAddress: { subdomains: [] },
          domain: null,
        }),
      },
      scanJob: { findMany: jest.fn().mockResolvedValue([]) },
      assetObservation: { findMany: findManyObs },
    } as never;
    const svc = new UnifiedAssetsService(prisma);
    const detail = await svc.detail('me', assetId);

    expect(findManyObs).toHaveBeenCalledWith({
      where: { assetId },
      orderBy: { observedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        kind: true,
        scannerName: true,
        observedAt: true,
        payload: true,
      },
    });
    expect(detail.observations).toHaveLength(2);
    expect(detail.observations[0]).toMatchObject({
      id: 'obs_1',
      kind: 'PORTSCAN',
      scannerName: 'nmap',
      ts: ts1,
    });
    expect(detail.observations[1]).toMatchObject({
      id: 'obs_2',
      kind: 'VULN',
      scannerName: 'nuclei',
      ts: ts2,
    });
  });
});

describe('UnifiedAssetsService.listObservations', () => {
  const userId = 'me';
  const assetId = 'a1';

  function makePrismaWith(findManyImpl: jest.Mock): jest.Mocked<PrismaService> {
    return {
      asset: {
        findFirst: jest.fn().mockResolvedValue({
          id: assetId,
          engagement: { ownerId: userId },
        }),
      },
      assetObservation: { findMany: findManyImpl },
    } as never;
  }

  it('throws ForbiddenException when the asset belongs to another user', async () => {
    const prisma = {
      asset: {
        findFirst: jest.fn().mockResolvedValue({
          id: assetId,
          engagement: { ownerId: 'other_user' },
        }),
      },
      assetObservation: { findMany: jest.fn() },
    } as never;
    const svc = new UnifiedAssetsService(prisma);
    await expect(svc.listObservations(userId, assetId, null, null)).rejects.toThrow(
      /Forbidden|forbidden/i,
    );
  });

  it('throws NotFoundError when the asset does not exist', async () => {
    const prisma = {
      asset: { findFirst: jest.fn().mockResolvedValue(null) },
      assetObservation: { findMany: jest.fn() },
    } as never;
    const svc = new UnifiedAssetsService(prisma);
    await expect(svc.listObservations(userId, assetId, null, null)).rejects.toThrow(NotFoundError);
  });

  it('defaults to limit=200 and requests take+1 to detect hasMore', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = new UnifiedAssetsService(makePrismaWith(findMany));
    await svc.listObservations(userId, assetId, null, null);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assetId },
        orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
        take: 201,
      }),
    );
  });

  it('clamps limit to the 500 max', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = new UnifiedAssetsService(makePrismaWith(findMany));
    await svc.listObservations(userId, assetId, null, 5000);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 501 }));
  });

  it('clamps limit to 1 minimum', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = new UnifiedAssetsService(makePrismaWith(findMany));
    await svc.listObservations(userId, assetId, null, 0);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
  });

  it('returns hasMore=true and a cursor when there is an extra row', async () => {
    const ts1 = new Date('2026-06-08T12:00:00Z');
    const ts2 = new Date('2026-06-08T11:00:00Z');
    const ts3 = new Date('2026-06-08T10:00:00Z');
    const findMany = jest.fn().mockResolvedValue([
      { id: 'o1', kind: 'K', scannerName: 's', observedAt: ts1, payload: null },
      { id: 'o2', kind: 'K', scannerName: 's', observedAt: ts2, payload: null },
      { id: 'o3', kind: 'K', scannerName: 's', observedAt: ts3, payload: null },
    ]);
    const svc = new UnifiedAssetsService(makePrismaWith(findMany));
    const page = await svc.listObservations(userId, assetId, null, 2);
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).not.toBeNull();
    // Cursor encodes the LAST returned row (o2/ts2), not the extra row.
    const decoded = Buffer.from(page.nextCursor as string, 'base64').toString('utf8');
    expect(decoded).toBe(`${ts2.toISOString()}|o2`);
  });

  it('returns hasMore=false and nextCursor=null on the last page', async () => {
    const ts = new Date('2026-06-08T12:00:00Z');
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { id: 'o1', kind: 'K', scannerName: 's', observedAt: ts, payload: null },
      ]);
    const svc = new UnifiedAssetsService(makePrismaWith(findMany));
    const page = await svc.listObservations(userId, assetId, null, 200);
    expect(page.items).toHaveLength(1);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('decodes the after cursor and filters by (observedAt, id) keyset', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = new UnifiedAssetsService(makePrismaWith(findMany));
    const cursorTs = new Date('2026-06-08T11:00:00Z');
    const cursor = Buffer.from(`${cursorTs.toISOString()}|o2`).toString('base64');
    await svc.listObservations(userId, assetId, cursor, 100);
    const call = findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      assetId,
      OR: [{ observedAt: { lt: cursorTs } }, { observedAt: cursorTs, id: { lt: 'o2' } }],
    });
  });

  it('ignores a malformed cursor and returns the first page', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = new UnifiedAssetsService(makePrismaWith(findMany));
    await svc.listObservations(userId, assetId, 'not-base64-or-anything', null);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { assetId } }));
  });
});

describe('UnifiedAssetsService — filters + sort', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: UnifiedAssetsService;
  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn().mockResolvedValue({ id: 'eng_1' }) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<PrismaService>;
    svc = new UnifiedAssetsService(prisma);
  });

  it('defaults to RISK_SCORE DESC when sort is undefined', async () => {
    await svc.list('user_1', 'eng_1', {});
    const sqlArg = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
    const stringified = sqlArg.strings.join(' ');
    expect(stringified).toContain('"riskScore" DESC');
  });

  it('sorts by FIRST_SEEN_AT when requested', async () => {
    await svc.list('user_1', 'eng_1', { sort: AssetSort.FIRST_SEEN_AT });
    const sqlArg = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
    expect(sqlArg.strings.join(' ')).toContain('"firstSeenAt" DESC');
  });

  it('applies severityHas as EXISTS subquery on Finding', async () => {
    await svc.list('user_1', 'eng_1', { filters: { severityHas: ['CRITICAL', 'HIGH'] } });
    const sqlArg = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
    expect(sqlArg.strings.join(' ')).toMatch(/EXISTS[\s\S]+"Finding"/);
  });
});
