import type { WorldState, ResolvableEntities, Candidate } from '../world-state';
import type { PredicateEval, StepEvaluation, EvaluationResult } from '../evaluation';

describe('engine context types', () => {
  it('models a WorldState + ResolvableEntities', () => {
    const world: WorldState = {
      target: 'example.com',
      openPorts: [{ port: 443, protocol: 'tcp' }],
      services: [{ port: 443, name: 'https' }],
      technologies: [{ name: 'wordpress' }],
      urls: ['https://example.com/'],
      endpoints: ['https://example.com/'],
      findings: [{ title: 'x', severity: 'HIGH' }],
      scannersRun: ['httpx'],
    };
    const entities: ResolvableEntities = {
      subdomains: [{ canonicalValue: 'www.example.com', httpStatus: 200 }],
      ipAddresses: [{ value: '1.2.3.4', cdn: { behind: false } }],
      urls: [{ canonicalUrl: 'https://example.com/', statusCode: 200 }],
      endpoints: [{ canonicalUrl: 'https://example.com/a', statusCode: 200 }],
      emails: [{ address: 'a@example.com' }],
    };
    const c: Candidate = { value: '1.2.3.4', cdn: { behind: false } };
    expect(world.target).toBe('example.com');
    expect(entities.ipAddresses[0].value).toBe('1.2.3.4');
    expect(c.value).toBe('1.2.3.4');
  });

  it('models an EvaluationResult', () => {
    const pe: PredicateEval = {
      pred: 'httpDetected',
      version: '1.0.0',
      scope: 'guard',
      expected: 'http surface present',
      actual: true,
      passed: true,
    };
    const se: StepEvaluation = {
      stepId: 's1',
      scannerName: 'httpx',
      gate: { passed: true, predicates: [pe] },
      targets: [{ value: 'example.com', keep: true, filters: [] }],
      action: 'run',
    };
    const res: EvaluationResult = { done: false, next: se, catalogVersion: '1.0.0' };
    expect(res.next?.action).toBe('run');
  });
});
