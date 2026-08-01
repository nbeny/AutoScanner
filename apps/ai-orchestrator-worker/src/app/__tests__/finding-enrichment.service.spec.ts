import { FindingEnrichmentService } from '../finding-enrichment.service';

function agent(output: unknown, degraded = false) {
  return { run: jest.fn().mockResolvedValue({ output, degraded }) };
}

function harness(findings: unknown[]) {
  const prisma = { finding: { findMany: jest.fn().mockResolvedValue(findings) } };
  const analyst = agent({ summary: 's', impact: 'RCE', priority: 'CRITICAL', action: 'patch' });
  const fp = agent({ confidence: 90, status: 'confirmed' });
  const rem = agent({ summary: 'r', steps: ['upgrade'], audience: 'sysadmin' });
  const svc = new FindingEnrichmentService(
    prisma as never,
    analyst as never,
    fp as never,
    rem as never,
  );
  return { svc, analyst, fp, rem };
}

const finding = (over: Record<string, unknown> = {}) => ({
  title: 'Log4Shell',
  severity: 'CRITICAL',
  cveId: 'CVE-2021-44228',
  location: 'https://a/x',
  evidence: {},
  ...over,
});

describe('FindingEnrichmentService.enrich', () => {
  it('runs the three agents per finding and returns their merged analysis', async () => {
    const { svc, analyst, fp, rem } = harness([finding()]);

    const res = await svc.enrich('run_1');

    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]).toMatchObject({
      title: 'Log4Shell',
      priority: 'CRITICAL',
      confidence: 90,
      status: 'confirmed',
      remediation: ['upgrade'],
    });
    expect(analyst.run).toHaveBeenCalledTimes(1);
    expect(fp.run).toHaveBeenCalledTimes(1);
    expect(rem.run).toHaveBeenCalledTimes(1);
  });

  it('enriches the highest-severity findings first and caps at 10', async () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      finding({ title: `f${i}`, severity: i === 14 ? 'CRITICAL' : 'LOW' }),
    );
    const { svc } = harness(many);

    const res = await svc.enrich('run_1');

    expect(res.findings).toHaveLength(10);
    // The single CRITICAL sorts to the front.
    expect(res.findings[0].title).toBe('f14');
  });

  it('returns an empty enrichment when the run has no findings', async () => {
    const { svc, analyst } = harness([]);

    const res = await svc.enrich('run_1');

    expect(res.findings).toEqual([]);
    expect(analyst.run).not.toHaveBeenCalled();
  });

  it('marks a finding degraded when any agent fell back', async () => {
    const { svc, rem } = harness([finding()]);
    rem.run.mockResolvedValue({
      output: { summary: 'r', steps: ['x'], audience: 'sysadmin' },
      degraded: true,
    });

    const res = await svc.enrich('run_1');

    expect(res.findings[0].degraded).toBe(true);
  });
});
