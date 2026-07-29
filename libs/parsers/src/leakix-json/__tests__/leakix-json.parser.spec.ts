import { LeakixJsonParser } from '../leakix-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'leakix',
  target: 'example.com',
  engagementId: 'e',
};

describe('LeakixJsonParser', () => {
  const parser = new LeakixJsonParser();

  it('maps probe exposures[] to NormalizedBreachExposure using the explicit fields', async () => {
    const report = JSON.stringify({
      query: 'example.com',
      exposures: [
        {
          breachName: 'Collection#1',
          dataClasses: ['Passwords', 'Email addresses'],
          passwordExposed: true,
          severity: 'HIGH',
          breachDate: '2019-01-07',
        },
        {
          breachName: 'exposed-mongo',
          dataClasses: ['IP addresses'],
          passwordExposed: false,
          severity: 'LOW',
        },
      ],
    });
    const out = await parser.parse(report, ctx);
    expect(out.breachExposures).toHaveLength(2);

    const c1 = out.breachExposures.find((b) => b.breachName === 'Collection#1');
    expect(c1).toMatchObject({
      seed: 'example.com',
      source: 'LEAKIX',
      passwordExposed: true,
      severity: 'HIGH',
      breachDate: '2019-01-07',
    });
    expect(c1?.dataClasses).toEqual(['Passwords', 'Email addresses']);

    const mongo = out.breachExposures.find((b) => b.breachName === 'exposed-mongo');
    expect(mongo).toMatchObject({ passwordExposed: false, severity: 'LOW' });
    expect(mongo?.breachDate).toBeUndefined();
  });

  it('uses report.query ?? ctx.target as the seed', async () => {
    const report = JSON.stringify({
      exposures: [{ breachName: 'no-query-breach', dataClasses: [] }],
    });
    const out = await parser.parse(report, ctx);
    expect(out.breachExposures[0]).toMatchObject({ seed: 'example.com' });
  });

  it('derives passwordExposed from data classes when the probe omits the flag', async () => {
    const report = JSON.stringify({
      query: 'q',
      exposures: [{ breachName: 'inferred', dataClasses: ['Password hashes'] }],
    });
    const out = await parser.parse(report, ctx);
    expect(out.breachExposures[0]).toMatchObject({ passwordExposed: true });
  });

  it('clamps an unknown/missing severity to a safe default', async () => {
    const report = JSON.stringify({
      query: 'q',
      exposures: [
        { breachName: 'unknown-sev', dataClasses: [], severity: 'super-critical-nonsense' },
        { breachName: 'no-sev', dataClasses: [] },
      ],
    });
    const out = await parser.parse(report, ctx);
    const unknown = out.breachExposures.find((b) => b.breachName === 'unknown-sev');
    const noSev = out.breachExposures.find((b) => b.breachName === 'no-sev');
    expect(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(unknown?.severity);
    expect(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(noSev?.severity);
  });

  it('skips exposures with a blank breachName', async () => {
    const report = JSON.stringify({
      query: 'q',
      exposures: [
        { breachName: '   ', dataClasses: [] },
        { breachName: 'kept', dataClasses: [] },
      ],
    });
    const out = await parser.parse(report, ctx);
    expect(out.breachExposures).toHaveLength(1);
    expect(out.breachExposures[0].breachName).toBe('kept');
  });

  it('returns empty output on empty / null / garbage / non-object', async () => {
    expect((await parser.parse('', ctx)).breachExposures).toEqual([]);
    expect((await parser.parse('null', ctx)).breachExposures).toEqual([]);
    expect((await parser.parse('nope', ctx)).breachExposures).toEqual([]);
    expect((await parser.parse('[]', ctx)).breachExposures).toEqual([]);
    expect((await parser.parse(JSON.stringify({ query: 'q' }), ctx)).breachExposures).toEqual([]);
  });
});
