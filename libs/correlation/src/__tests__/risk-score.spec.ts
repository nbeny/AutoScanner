import { clusterWeight, computeRiskScore, type RiskScoreInput } from '../risk-score';

const empty: RiskScoreInput = { correlatedFindings: [], ports: [] };

describe('computeRiskScore', () => {
  it('returns 0 for an asset with no findings and no ports', () => {
    expect(computeRiskScore(empty)).toBe(0);
  });

  // ── Count-once semantics ──────────────────────────────────────────────────
  // In v2 the function receives CorrelatedFinding clusters, not raw findings.
  // Each cluster is already "one issue" regardless of how many raw findings
  // contributed to it.

  it('count-once: 1 CRITICAL cluster scores 10 (same weight as the old 1-finding case)', () => {
    const score = computeRiskScore({
      ports: [],
      correlatedFindings: [{ severity: 'CRITICAL', cveId: null, status: 'OPEN', cvss: null }],
    });
    expect(score).toBe(10);
  });

  it('count-once: 3 CRITICAL clusters score 30 (each cluster counted once)', () => {
    const score = computeRiskScore({
      ports: [],
      correlatedFindings: [
        { severity: 'CRITICAL', cveId: null, status: 'OPEN', cvss: null },
        { severity: 'CRITICAL', cveId: null, status: 'OPEN', cvss: null },
        { severity: 'CRITICAL', cveId: null, status: 'OPEN', cvss: null },
      ],
    });
    expect(score).toBe(30);
  });

  // ── Severity weight fallback (no CVSS) ──────────────────────────────────

  it('weights clusters by severity when cvss is null: CRITICAL=10, HIGH=5, MEDIUM=2, LOW=0.5, INFO=0', () => {
    const score = computeRiskScore({
      ports: [],
      correlatedFindings: [
        { severity: 'CRITICAL', cveId: null, status: 'OPEN', cvss: null },
        { severity: 'HIGH', cveId: null, status: 'OPEN', cvss: null },
        { severity: 'MEDIUM', cveId: null, status: 'OPEN', cvss: null },
        { severity: 'LOW', cveId: null, status: 'OPEN', cvss: null },
        { severity: 'INFO', cveId: null, status: 'OPEN', cvss: null },
      ],
    });
    expect(score).toBe(10 + 5 + 2 + 0.5 + 0);
  });

  // ── CVSS-derived weight ──────────────────────────────────────────────────
  // When cvss is non-null the score uses the CVSS value directly (0–10 scale).
  // A cluster with cvss=9.8 outranks a bare CRITICAL bucket (10 → 9.8 is
  // slightly below 10, but cvss=10.0 equals CRITICAL).  The important property
  // is that a HIGH-severity cluster with cvss=9.8 outranks a plain MEDIUM (2).

  it('CVSS used: a HIGH cluster with cvss=9.8 contributes 9.8, outranking a MEDIUM cluster (2)', () => {
    const high = computeRiskScore({
      ports: [],
      correlatedFindings: [{ severity: 'HIGH', cveId: 'CVE-2024-0001', status: 'OPEN', cvss: 9.8 }],
    });
    const medium = computeRiskScore({
      ports: [],
      correlatedFindings: [{ severity: 'MEDIUM', cveId: null, status: 'OPEN', cvss: null }],
    });
    expect(high).toBeCloseTo(9.8);
    expect(high).toBeGreaterThan(medium);
  });

  it('CVSS used: cvss=10.0 contributes 10 (same as CRITICAL bucket)', () => {
    const score = computeRiskScore({
      ports: [],
      correlatedFindings: [
        { severity: 'HIGH', cveId: 'CVE-2024-0002', status: 'OPEN', cvss: 10.0 },
      ],
    });
    expect(score).toBeCloseTo(10.0);
  });

  // ── CVSS fallback ────────────────────────────────────────────────────────

  it('CVSS fallback: null cvss falls back to SEVERITY_WEIGHT[severity]', () => {
    const withCvss = computeRiskScore({
      ports: [],
      correlatedFindings: [{ severity: 'HIGH', cveId: 'CVE-2024-0003', status: 'OPEN', cvss: 7.5 }],
    });
    const withoutCvss = computeRiskScore({
      ports: [],
      correlatedFindings: [
        { severity: 'HIGH', cveId: 'CVE-2024-0003', status: 'OPEN', cvss: null },
      ],
    });
    expect(withCvss).toBeCloseTo(7.5);
    expect(withoutCvss).toBe(5); // HIGH fallback
  });

  // ── Status exclusion ─────────────────────────────────────────────────────

  it('status exclusion: FALSE_POSITIVE clusters contribute 0', () => {
    const score = computeRiskScore({
      ports: [],
      correlatedFindings: [
        { severity: 'CRITICAL', cveId: null, status: 'FALSE_POSITIVE', cvss: null },
        { severity: 'HIGH', cveId: null, status: 'OPEN', cvss: null },
      ],
    });
    expect(score).toBe(5); // only HIGH counted
  });

  it('status exclusion: RESOLVED clusters contribute 0', () => {
    const score = computeRiskScore({
      ports: [],
      correlatedFindings: [
        { severity: 'CRITICAL', cveId: null, status: 'RESOLVED', cvss: null },
        { severity: 'MEDIUM', cveId: null, status: 'OPEN', cvss: null },
      ],
    });
    expect(score).toBe(2); // only MEDIUM counted
  });

  it('status exclusion: OPEN, TRIAGED, CONFIRMED clusters are all counted', () => {
    const score = computeRiskScore({
      ports: [],
      correlatedFindings: [
        { severity: 'HIGH', cveId: null, status: 'OPEN', cvss: null },
        { severity: 'HIGH', cveId: null, status: 'TRIAGED', cvss: null },
        { severity: 'HIGH', cveId: null, status: 'CONFIRMED', cvss: null },
      ],
    });
    expect(score).toBe(15); // 3 × 5
  });

  it('status exclusion: returns 0 when all clusters are excluded', () => {
    const score = computeRiskScore({
      ports: [],
      correlatedFindings: [
        { severity: 'CRITICAL', cveId: null, status: 'FALSE_POSITIVE', cvss: null },
        { severity: 'CRITICAL', cveId: null, status: 'RESOLVED', cvss: null },
      ],
    });
    expect(score).toBe(0);
  });

  // ── Port bonuses (unchanged) ─────────────────────────────────────────────

  it('adds +2 per distinct OPEN sensitive port (22, 23, 445, 1433, 3306, 3389, 5432, 5900, 6379)', () => {
    const ports = [22, 3389, 6379].map((number) => ({
      number,
      state: 'OPEN' as const,
      services: [],
    }));
    expect(computeRiskScore({ correlatedFindings: [], ports })).toBe(6);
  });

  it('does NOT count sensitive port bonus when the port is not OPEN', () => {
    expect(
      computeRiskScore({
        correlatedFindings: [],
        ports: [{ number: 22, state: 'FILTERED', services: [] }],
      }),
    ).toBe(0);
  });

  it('does NOT count non-sensitive ports', () => {
    expect(
      computeRiskScore({
        correlatedFindings: [],
        ports: [{ number: 80, state: 'OPEN', services: [] }],
      }),
    ).toBe(0);
  });

  it('adds +3 once when a Service.name or Service.product contains an admin token', () => {
    const score = computeRiskScore({
      correlatedFindings: [],
      ports: [
        {
          number: 8080,
          state: 'OPEN',
          services: [{ name: null, product: 'Jenkins LTS 2.426' }],
        },
      ],
    });
    expect(score).toBe(3);
  });

  it('admin token match is case-insensitive', () => {
    const score = computeRiskScore({
      correlatedFindings: [],
      ports: [
        {
          number: 3000,
          state: 'OPEN',
          services: [{ name: 'GRAFANA', product: null }],
        },
      ],
    });
    expect(score).toBe(3);
  });

  it('admin bonus is a one-shot +3 even with multiple matching services', () => {
    const score = computeRiskScore({
      correlatedFindings: [],
      ports: [
        {
          number: 3000,
          state: 'OPEN',
          services: [
            { name: 'grafana', product: null },
            { name: 'phpmyadmin', product: 'admin-panel' },
          ],
        },
      ],
    });
    expect(score).toBe(3);
  });

  // ── Combined ─────────────────────────────────────────────────────────────

  it('combined: 1 CRITICAL cluster (cvss=9.5) + 1 HIGH cluster + sensitive port 22 + grafana = 9.5+5+2+3', () => {
    const score = computeRiskScore({
      correlatedFindings: [
        { severity: 'CRITICAL', cveId: 'CVE-2024-9999', status: 'OPEN', cvss: 9.5 },
        { severity: 'HIGH', cveId: null, status: 'OPEN', cvss: null },
      ],
      ports: [
        { number: 22, state: 'OPEN', services: [{ name: 'ssh', product: null }] },
        { number: 3000, state: 'OPEN', services: [{ name: 'grafana', product: null }] },
      ],
    });
    expect(score).toBeCloseTo(9.5 + 5 + 2 + 3);
  });

  it('combined: FALSE_POSITIVE cluster excluded, only OPEN clusters + port bonus counted', () => {
    const score = computeRiskScore({
      correlatedFindings: [
        { severity: 'CRITICAL', cveId: null, status: 'FALSE_POSITIVE', cvss: null },
        { severity: 'HIGH', cveId: null, status: 'OPEN', cvss: null },
      ],
      ports: [{ number: 22, state: 'OPEN', services: [] }],
    });
    expect(score).toBe(5 + 2); // HIGH + port bonus, CRITICAL excluded
  });

  it('is idempotent: same input produces same output', () => {
    const input: RiskScoreInput = {
      correlatedFindings: [{ severity: 'HIGH', cveId: 'CVE-2024-1', status: 'OPEN', cvss: 7.2 }],
      ports: [{ number: 22, state: 'OPEN', services: [] }],
    };
    expect(computeRiskScore(input)).toBe(computeRiskScore(input));
  });
});

describe('clusterWeight (exported for triage ordering)', () => {
  it('uses CVSS score when present', () => {
    expect(clusterWeight({ severity: 'LOW', cveId: 'CVE-1', status: 'OPEN', cvss: 9.8 })).toBe(9.8);
  });

  it('falls back to the severity bucket when cvss is null', () => {
    expect(clusterWeight({ severity: 'HIGH', cveId: null, status: 'OPEN', cvss: null })).toBe(5);
  });
});
