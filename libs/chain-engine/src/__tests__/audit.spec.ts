import { buildAudit } from '../audit';
import type { AuditInput } from '../evaluation';

const input: AuditInput = {
  chainDisplayName: 'Web Full',
  target: 'example.com',
  steps: [
    {
      stepId: 'httpx',
      scannerName: 'httpx',
      gate: { passed: true, predicates: [] },
      targets: [{ value: 'example.com', keep: true, filters: [] }],
      action: 'run',
    },
    {
      stepId: 'wpscan',
      scannerName: 'wpscan',
      gate: { passed: false, predicates: [] },
      targets: [],
      action: 'skip',
      skipReason: 'gate: techPresent non satisfait',
    },
  ],
  discovered: {
    ipAddresses: 3,
    technologies: ['nginx', 'WordPress'],
    endpoints: 12,
    findings: { total: 2, bySeverity: { HIGH: 1, LOW: 1 } },
  },
};

describe('buildAudit', () => {
  it('produces deterministic markdown', () => {
    const a = buildAudit(input);
    const b = buildAudit(input);
    expect(a).toBe(b); // déterminisme
    expect(a).toContain('# Chaîne « Web Full » — example.com');
    expect(a).toContain('Étapes : 1 lancée(s), 1 skippée(s)');
    expect(a).toContain('wpscan');
    expect(a).toContain('HIGH: 1');
  });

  it('sorts technologies and severities canonically', () => {
    const a = buildAudit(input);
    expect(a.indexOf('WordPress')).toBeLessThan(a.indexOf('nginx')); // tri lexicographique
    expect(a.indexOf('HIGH')).toBeLessThan(a.indexOf('LOW')); // ordre de sévérité
  });
});
