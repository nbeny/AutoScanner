/**
 * Guard tests for the product invariant stated in CLAUDE.md:
 *
 *   "re-scans must never overwrite an operator's triage `status`"
 *
 * Before SP2a this held only because ONE object literal in the correlation upsert happened
 * to have no `status` key — no assertion, no DB constraint, no test. SP2d adds two more
 * writers of CorrelatedFinding (threat-intel, compliance), so the invariant needed teeth.
 *
 * These tests assert on the ARGUMENTS handed to Prisma, so they fail the moment anyone adds
 * `status` to a re-scan write path — which is exactly the regression they exist to catch.
 */
import { CorrelationService } from '../correlation.service';
import { TriageService } from '../triage.service';

function makeCorrelationHarness(findings: unknown[]) {
  const upsert = jest.fn().mockResolvedValue({ id: 'cluster_1' });
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const tx = {
    correlatedFinding: { upsert },
    finding: { updateMany },
  };
  const prisma = {
    finding: { findMany: jest.fn().mockResolvedValue(findings) },
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  return { svc: new CorrelationService(prisma as never), prisma, upsert, updateMany };
}

const findingRow = {
  id: 'f1',
  title: 'Log4Shell',
  severity: 'CRITICAL',
  cveId: 'CVE-2021-44228',
  templateId: null,
  location: 'https://a.example.com/api',
  firstSeenAt: new Date('2026-01-01T00:00:00Z'),
  lastSeenAt: new Date('2026-01-02T00:00:00Z'),
  asset: { id: 'asset_a', canonicalValue: 'a.example.com', engagementId: 'eng_1' },
  scanJob: { scannerName: 'nuclei' },
};

describe('triage invariant — correlation never writes status', () => {
  it('omits status from BOTH the create and the update payload', async () => {
    const { svc, upsert } = makeCorrelationHarness([findingRow]);

    await svc.correlateFindings('eng_1');

    expect(upsert).toHaveBeenCalled();
    const arg = upsert.mock.calls[0][0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    // If either of these ever gains a `status` key, an operator's triage would be
    // silently reset on the next scan.
    expect(Object.keys(arg.create)).not.toContain('status');
    expect(Object.keys(arg.update)).not.toContain('status');
  });

  it('leaves an already-CONFIRMED cluster untouched when the same finding re-correlates', async () => {
    const { svc, upsert } = makeCorrelationHarness([findingRow]);
    // Simulate the row already carrying operator triage.
    upsert.mockResolvedValue({ id: 'cluster_1', status: 'CONFIRMED' });

    await svc.correlateFindings('eng_1');

    const arg = upsert.mock.calls[0][0] as { update: Record<string, unknown> };
    expect(arg.update).not.toHaveProperty('status');
  });

  it('keeps the cluster upsert and the member relink in the same transaction', async () => {
    const { svc, prisma, upsert, updateMany } = makeCorrelationHarness([findingRow]);

    await svc.correlateFindings('eng_1');

    // Both writes must be inside the tx callback: a crash between them used to leave a
    // cluster with sourceCount set and no members (SP2 spec §2.4.5).
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalled();
  });
});

describe('triage invariant — the operator path is the only status writer', () => {
  function makeTriageHarness(current = 'OPEN') {
    const update = jest.fn().mockResolvedValue({ id: 'c1', status: 'CONFIRMED' });
    const create = jest.fn().mockResolvedValue({});
    const tx = { correlatedFinding: { update }, findingStatusEvent: { create } };
    const prisma = {
      correlatedFinding: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', status: current }) },
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    return { svc: new TriageService(prisma as never), prisma, update, create };
  }

  it('writes the new status and its audit event in one transaction', async () => {
    const { svc, prisma, update, create } = makeTriageHarness('OPEN');

    const res = await svc.setStatus({
      correlatedFindingId: 'c1',
      status: 'CONFIRMED',
      actorId: 'user_1',
      note: 'verified manually',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { status: 'CONFIRMED' } }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          correlatedFindingId: 'c1',
          fromStatus: 'OPEN',
          toStatus: 'CONFIRMED',
          actorId: 'user_1',
          note: 'verified manually',
        }),
      }),
    );
    expect(res.status).toBe('CONFIRMED');
  });

  it('records the previous status so the audit trail is a real transition', async () => {
    const { svc, create } = makeTriageHarness('TRIAGED');

    await svc.setStatus({ correlatedFindingId: 'c1', status: 'RESOLVED', actorId: 'u' });

    expect(create.mock.calls[0][0].data.fromStatus).toBe('TRIAGED');
  });

  it('rejects an unknown cluster instead of silently creating one', async () => {
    const { svc, prisma } = makeTriageHarness();
    prisma.correlatedFinding.findUnique.mockResolvedValue(null);

    await expect(
      svc.setStatus({ correlatedFindingId: 'missing', status: 'OPEN', actorId: 'u' }),
    ).rejects.toThrow();
  });
});
