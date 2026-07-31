import { evaluate, buildAudit } from '../index';
import type { WorldState, ResolvableEntities } from '../world-state';
import type { StepEvaluation, AuditInput } from '../evaluation';
import { WebFullChain } from '@autoscanner/chains';

// World-state figé : http détecté + WordPress présent.
const world: WorldState = {
  target: 'example.com',
  openPorts: [{ port: 443, protocol: 'tcp' }],
  services: [{ port: 443, name: 'https' }],
  technologies: [{ name: 'WordPress', version: '6.5' }, { name: 'nginx' }],
  urls: ['https://example.com/'],
  endpoints: ['https://example.com/'],
  findings: [{ title: 'XSS', severity: 'HIGH' }],
  scannersRun: ['httpx', 'webanalyze', 'gobuster', 'nuclei', 'wpscan'],
};

const entities: ResolvableEntities = {
  subdomains: [{ canonicalValue: 'www.example.com', httpStatus: 200 }],
  ipAddresses: [],
  urls: [{ canonicalUrl: 'https://example.com/', statusCode: 200 }],
  endpoints: [],
  emails: [],
};

describe('web-full end-to-end (pure loop)', () => {
  it('runs all steps including the wordpress branch', () => {
    const executed = new Set<string>();
    const trace: StepEvaluation[] = [];
    for (let i = 0; i < 10; i++) {
      const res = evaluate(WebFullChain, world, entities, executed);
      if (res.done) break;
      const step = res.next!;
      trace.push(step);
      executed.add(step.stepId);
    }
    expect(trace.map((s) => s.stepId)).toEqual([
      'httpx',
      'webanalyze',
      'gobuster',
      'nuclei',
      'wpscan',
    ]);
    // toutes lancées (http détecté + wordpress présent + urls 2xx)
    expect(trace.every((s) => s.action === 'run')).toBe(true);
  });

  it('skips the wordpress branch when tech is absent', () => {
    const noWp: WorldState = { ...world, technologies: [{ name: 'nginx' }] };
    const executed = new Set<string>(['httpx', 'webanalyze', 'gobuster', 'nuclei']);
    const res = evaluate(WebFullChain, noWp, entities, executed);
    expect(res.next?.stepId).toBe('wpscan');
    expect(res.next?.action).toBe('skip');
    expect(res.next?.skipReason).toMatch(/techPresent/);
  });

  it('produces a coherent audit from the trace', () => {
    const executed = new Set<string>();
    const trace: StepEvaluation[] = [];
    for (let i = 0; i < 10; i++) {
      const res = evaluate(WebFullChain, world, entities, executed);
      if (res.done) break;
      trace.push(res.next!);
      executed.add(res.next!.stepId);
    }
    const auditInput: AuditInput = {
      chainDisplayName: WebFullChain.displayName,
      target: world.target,
      steps: trace,
      discovered: {
        ipAddresses: 0,
        technologies: world.technologies.map((t) => t.name),
        endpoints: world.endpoints.length,
        findings: { total: 1, bySeverity: { HIGH: 1 } },
      },
    };
    const audit = buildAudit(auditInput);
    expect(audit).toContain('Étapes : 5 lancée(s), 0 skippée(s)');
    expect(audit).toContain('WordPress');
    expect(audit).toContain('HIGH: 1');
  });
});
