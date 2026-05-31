import { computeRiskScore, type RiskScoreInput } from '../risk-score';

const empty: RiskScoreInput = { findings: [], ports: [] };

describe('computeRiskScore', () => {
  it('returns 0 for an asset with no findings and no ports', () => {
    expect(computeRiskScore(empty)).toBe(0);
  });

  it('weights findings: CRITICAL=10, HIGH=5, MEDIUM=2, LOW=0.5, INFO=0', () => {
    const score = computeRiskScore({
      ports: [],
      findings: [
        { severity: 'CRITICAL', cveId: null },
        { severity: 'HIGH', cveId: null },
        { severity: 'MEDIUM', cveId: null },
        { severity: 'LOW', cveId: null },
        { severity: 'INFO', cveId: null },
      ],
    });
    expect(score).toBe(10 + 5 + 2 + 0.5 + 0);
  });

  it('adds +2 per distinct OPEN sensitive port (22, 23, 445, 1433, 3306, 3389, 5432, 5900, 6379)', () => {
    const ports = [22, 3389, 6379].map((number) => ({
      number,
      state: 'OPEN' as const,
      services: [],
    }));
    expect(computeRiskScore({ findings: [], ports })).toBe(6);
  });

  it('does NOT count sensitive port bonus when the port is not OPEN', () => {
    expect(
      computeRiskScore({
        findings: [],
        ports: [{ number: 22, state: 'FILTERED', services: [] }],
      }),
    ).toBe(0);
  });

  it('does NOT count non-sensitive ports', () => {
    expect(
      computeRiskScore({
        findings: [],
        ports: [{ number: 80, state: 'OPEN', services: [] }],
      }),
    ).toBe(0);
  });

  it('adds +3 once when a Service.name or Service.product contains an admin token', () => {
    const score = computeRiskScore({
      findings: [],
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
      findings: [],
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
      findings: [],
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

  it('adds +1 per distinct non-null cveId', () => {
    const score = computeRiskScore({
      ports: [],
      findings: [
        { severity: 'INFO', cveId: 'CVE-2024-0001' },
        { severity: 'INFO', cveId: 'CVE-2024-0002' },
        { severity: 'INFO', cveId: 'CVE-2024-0001' }, // duplicate -> ignored
        { severity: 'INFO', cveId: null },
      ],
    });
    expect(score).toBe(2);
  });

  it('combined: 1 CRITICAL + 1 HIGH + sensitive port 22 + grafana service + 1 distinct CVE = 10+5+2+3+1 = 21', () => {
    const score = computeRiskScore({
      findings: [
        { severity: 'CRITICAL', cveId: 'CVE-2024-9999' },
        { severity: 'HIGH', cveId: null },
      ],
      ports: [
        { number: 22, state: 'OPEN', services: [{ name: 'ssh', product: null }] },
        { number: 3000, state: 'OPEN', services: [{ name: 'grafana', product: null }] },
      ],
    });
    expect(score).toBe(21);
  });

  it('is idempotent: same input produces same output', () => {
    const input: RiskScoreInput = {
      findings: [{ severity: 'HIGH', cveId: 'CVE-2024-1' }],
      ports: [{ number: 22, state: 'OPEN', services: [] }],
    };
    expect(computeRiskScore(input)).toBe(computeRiskScore(input));
  });
});
