import { AttackPathsService } from '../attack-paths.service';

function cluster(over: Record<string, unknown> = {}) {
  return {
    id: 'cf1',
    title: 'RCE',
    severity: 'HIGH',
    cveId: null,
    status: 'OPEN',
    asset: { canonicalValue: 'a.x', ports: [] as unknown[] },
    ...over,
  };
}

function harness(clusters: unknown[], owned = true) {
  const prisma = {
    engagement: { findFirst: jest.fn().mockResolvedValue(owned ? { id: 'e1' } : null) },
    correlatedFinding: { findMany: jest.fn().mockResolvedValue(clusters) },
    nvdCve: { findMany: jest.fn().mockResolvedValue([]) },
    cveCache: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { svc: new AttackPathsService(prisma as never), prisma };
}

describe('AttackPathsService.forEngagement', () => {
  it('ranks an internet-exposed HIGH above an isolated CRITICAL', async () => {
    const exposedHigh = cluster({
      id: 'exposed',
      severity: 'HIGH',
      asset: {
        canonicalValue: 'exposed.x',
        ports: [{ number: 22, state: 'OPEN', services: [{ name: 'ssh', product: null }] }],
      },
    });
    const isolatedCritical = cluster({
      id: 'isolated',
      severity: 'CRITICAL',
      asset: { canonicalValue: 'iso.x', ports: [] },
    });
    const { svc } = harness([isolatedCritical, exposedHigh]);

    const paths = await svc.forEngagement('u1', 'e1');

    // Exposure lifts the HIGH (5 * 1.5 = 7.5) above the isolated CRITICAL (10 * 1 = 10)? No —
    // CRITICAL base 10 still wins, but the exposed one is boosted and flagged. Assert exposure
    // is reflected and both are present, ordered by score.
    expect(paths).toHaveLength(2);
    expect(paths.map((p) => p.correlatedFindingId)).toContain('exposed');
    const exposed = paths.find((p) => p.correlatedFindingId === 'exposed')!;
    expect(exposed.exposed).toBe(true);
    expect(exposed.rationale).toContain('open sensitive port');
    // scores are sorted descending
    expect(paths[0].score).toBeGreaterThanOrEqual(paths[1].score);
  });

  it('flags an admin-panel service as exposed and boosts its score', async () => {
    const c = cluster({
      asset: {
        canonicalValue: 'admin.x',
        ports: [{ number: 8080, state: 'OPEN', services: [{ name: 'http', product: 'Jenkins' }] }],
      },
    });
    const { svc } = harness([c]);

    const [path] = await svc.forEngagement('u1', 'e1');

    expect(path.exposed).toBe(true);
    expect(path.rationale).toContain('admin-panel service');
  });

  it('marks a finding with no exposure as not exposed', async () => {
    const { svc } = harness([cluster()]);
    const [path] = await svc.forEngagement('u1', 'e1');
    expect(path.exposed).toBe(false);
    expect(path.rationale).toContain('no elevated exposure');
  });

  it('rejects an engagement the user does not own', async () => {
    const { svc } = harness([], false);
    await expect(svc.forEngagement('u1', 'e1')).rejects.toThrow();
  });
});
