import type { PrismaService } from '@autoscanner/database';
import { CorrelationService } from '../correlation.service';
import { structuralFindingHash } from '@autoscanner/correlation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(
  overrides: Partial<{
    id: string;
    title: string;
    location: string | null;
    cveId: string | null;
    templateId: string | null;
    severity: string;
    firstSeenAt: Date;
    lastSeenAt: Date;
    assetId: string;
    canonicalValue: string;
    scannerName: string;
  }> = {},
) {
  const id = overrides.id ?? 'finding_1';
  const assetId = overrides.assetId ?? 'asset_1';
  const canonicalValue = overrides.canonicalValue ?? 'example.com';
  return {
    id,
    title: overrides.title ?? 'Some Finding',
    location: overrides.location ?? null,
    cveId: overrides.cveId ?? null,
    templateId: overrides.templateId ?? null,
    severity: overrides.severity ?? 'INFO',
    firstSeenAt: overrides.firstSeenAt ?? new Date('2024-01-01T00:00:00Z'),
    lastSeenAt: overrides.lastSeenAt ?? new Date('2024-01-01T00:00:00Z'),
    asset: { id: assetId, canonicalValue },
    scanJob: { scannerName: overrides.scannerName ?? 'nuclei' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CorrelationService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let service: CorrelationService;

  function buildPrisma(findings: ReturnType<typeof makeFinding>[]) {
    let clusterSeq = 0;
    prisma = {
      finding: {
        findMany: jest.fn().mockResolvedValue(findings),
        updateMany: jest.fn().mockResolvedValue({ count: findings.length }),
      },
      correlatedFinding: {
        upsert: jest.fn().mockImplementation(() => {
          clusterSeq++;
          return Promise.resolve({ id: `cf_${clusterSeq}` });
        }),
      },
      // SP2a: the cluster upsert and the member relink now commit together, so the service
      // writes through the transaction client. Route it back to the same mocks.
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    } as unknown as jest.Mocked<PrismaService>;
    service = new CorrelationService(prisma);
  }

  // -------------------------------------------------------------------------
  // Scenario 1: two findings with the same CVE on the same asset from different
  // scanners → ONE cluster, sourceCount = 2.
  // -------------------------------------------------------------------------
  it('groups two same-CVE findings on the same asset into ONE cluster with sourceCount 2', async () => {
    const f1 = makeFinding({
      id: 'f1',
      cveId: 'CVE-2021-44228',
      title: 'Log4Shell',
      severity: 'CRITICAL',
      scannerName: 'nuclei',
      assetId: 'asset_1',
      canonicalValue: 'api.example.com',
    });
    const f2 = makeFinding({
      id: 'f2',
      cveId: 'CVE-2021-44228',
      title: 'Log4Shell (alternative detection)',
      severity: 'HIGH',
      scannerName: 'openvas',
      assetId: 'asset_1',
      canonicalValue: 'api.example.com',
    });

    buildPrisma([f1, f2]);

    const { clusters } = await service.correlateFindings('eng_1');

    expect(clusters).toBe(1);
    expect(prisma.correlatedFinding.upsert).toHaveBeenCalledTimes(1);

    const upsertCall = (prisma.correlatedFinding.upsert as jest.Mock).mock
      .calls[0][0] as Parameters<typeof prisma.correlatedFinding.upsert>[0];

    expect(upsertCall.create.sourceCount).toBe(2);
    expect(upsertCall.update.sourceCount).toBe(2);

    // Both findings linked to the same cluster
    expect(prisma.finding.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: expect.arrayContaining(['f1', 'f2']) } },
        data: expect.objectContaining({ correlatedFindingId: 'cf_1' }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 2: two findings in the weak-tls-protocol category (from different
  // scanners/titles) on the same asset → ONE cluster.
  // -------------------------------------------------------------------------
  it('groups same-category findings on the same asset into ONE cluster', async () => {
    // Both titles should match `weak-tls-protocol` via finding-categories.ts
    const f1 = makeFinding({
      id: 'f1',
      title: 'Weak TLS version: tls10',
      severity: 'MEDIUM',
      scannerName: 'tlsx',
      assetId: 'asset_2',
      canonicalValue: 'web.example.com',
    });
    const f2 = makeFinding({
      id: 'f2',
      title: 'Weak SSL/TLS protocol enabled: SSLv3',
      severity: 'MEDIUM',
      scannerName: 'sslscan',
      assetId: 'asset_2',
      canonicalValue: 'web.example.com',
    });

    buildPrisma([f1, f2]);

    // Verify the category for both findings is the same (test premise).
    const { category: cat1 } = structuralFindingHash({
      scannerName: 'tlsx',
      title: f1.title,
      assetCanonical: 'web.example.com',
    });
    const { category: cat2 } = structuralFindingHash({
      scannerName: 'sslscan',
      title: f2.title,
      assetCanonical: 'web.example.com',
    });
    expect(cat1).toBe('weak-tls-protocol');
    expect(cat2).toBe('weak-tls-protocol');

    const { clusters } = await service.correlateFindings('eng_1');

    expect(clusters).toBe(1);
    expect(prisma.correlatedFinding.upsert).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Scenario 3: two fallback findings (no CVE, no category, different scanner)
  // on the same asset → TWO clusters (hash includes scannerName for raw bucket).
  // -------------------------------------------------------------------------
  it('creates TWO clusters for two fallback findings with no CVE/category but different scanners', async () => {
    const f1 = makeFinding({
      id: 'f1',
      title: 'Obscure finding alpha',
      severity: 'LOW',
      scannerName: 'scanner_a',
      assetId: 'asset_3',
      canonicalValue: 'db.example.com',
    });
    const f2 = makeFinding({
      id: 'f2',
      title: 'Obscure finding alpha',
      severity: 'INFO',
      scannerName: 'scanner_b',
      assetId: 'asset_3',
      canonicalValue: 'db.example.com',
    });

    buildPrisma([f1, f2]);

    // Both should fall into the `raw` bucket — different scanner → different hash.
    const { hash: h1, category: c1 } = structuralFindingHash({
      scannerName: 'scanner_a',
      title: f1.title,
      assetCanonical: 'db.example.com',
    });
    const { hash: h2, category: c2 } = structuralFindingHash({
      scannerName: 'scanner_b',
      title: f2.title,
      assetCanonical: 'db.example.com',
    });
    expect(c1).toBeNull();
    expect(c2).toBeNull();
    expect(h1).not.toBe(h2);

    const { clusters } = await service.correlateFindings('eng_1');

    expect(clusters).toBe(2);
    expect(prisma.correlatedFinding.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.finding.updateMany).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Scenario 4: severity = max of all member findings.
  // -------------------------------------------------------------------------
  it('picks the maximum severity across grouped members', async () => {
    const f1 = makeFinding({
      id: 'f1',
      cveId: 'CVE-2022-1234',
      title: 'Some CVE',
      severity: 'MEDIUM',
      scannerName: 'nuclei',
      assetId: 'asset_4',
      canonicalValue: 'host.example.com',
    });
    const f2 = makeFinding({
      id: 'f2',
      cveId: 'CVE-2022-1234',
      title: 'Some CVE',
      severity: 'HIGH',
      scannerName: 'openvas',
      assetId: 'asset_4',
      canonicalValue: 'host.example.com',
    });

    buildPrisma([f1, f2]);

    await service.correlateFindings('eng_1');

    const upsertCall = (prisma.correlatedFinding.upsert as jest.Mock).mock
      .calls[0][0] as Parameters<typeof prisma.correlatedFinding.upsert>[0];

    expect(upsertCall.create.severity).toBe('HIGH');
    expect(upsertCall.update.severity).toBe('HIGH');
  });

  // -------------------------------------------------------------------------
  // Scenario 5: status NOT present in create OR update.
  // -------------------------------------------------------------------------
  it('never includes status in the upsert create or update payload', async () => {
    const f1 = makeFinding({
      id: 'f1',
      cveId: 'CVE-2023-9999',
      title: 'Critical finding',
      severity: 'CRITICAL',
      scannerName: 'nuclei',
      assetId: 'asset_5',
      canonicalValue: 'target.example.com',
    });

    buildPrisma([f1]);

    await service.correlateFindings('eng_1');

    const upsertCall = (prisma.correlatedFinding.upsert as jest.Mock).mock
      .calls[0][0] as Parameters<typeof prisma.correlatedFinding.upsert>[0];

    expect(upsertCall.create).not.toHaveProperty('status');
    expect(upsertCall.update).not.toHaveProperty('status');
  });

  // -------------------------------------------------------------------------
  // Scenario 6: finding.updateMany links member ids + structuralHash.
  // -------------------------------------------------------------------------
  it('calls finding.updateMany with member ids and structuralHash for each cluster', async () => {
    const f1 = makeFinding({
      id: 'f1',
      cveId: 'CVE-2024-0001',
      title: 'Test CVE',
      severity: 'HIGH',
      scannerName: 'nuclei',
      assetId: 'asset_6',
      canonicalValue: 'linked.example.com',
    });

    buildPrisma([f1]);

    const { hash: expectedHash } = structuralFindingHash({
      scannerName: 'nuclei',
      cveId: 'CVE-2024-0001',
      assetCanonical: 'linked.example.com',
      title: f1.title,
    });

    await service.correlateFindings('eng_1');

    expect(prisma.finding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['f1'] } },
        data: expect.objectContaining({
          correlatedFindingId: 'cf_1',
          structuralHash: expectedHash,
        }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 7: returns { clusters: 0 } when there are no findings.
  // -------------------------------------------------------------------------
  it('returns { clusters: 0 } when engagement has no findings', async () => {
    buildPrisma([]);

    const { clusters } = await service.correlateFindings('eng_1');

    expect(clusters).toBe(0);
    expect(prisma.correlatedFinding.upsert).not.toHaveBeenCalled();
    expect(prisma.finding.updateMany).not.toHaveBeenCalled();
  });
});
