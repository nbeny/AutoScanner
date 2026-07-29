import { H8mailJsonParser } from '../h8mail-json.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'h8mail',
  target: 'a@x.com',
  engagementId: 'e',
};

describe('H8mailJsonParser', () => {
  const parser = new H8mailJsonParser();

  it('maps h8mail targets[].data breaches to NormalizedBreachExposure', async () => {
    const report = JSON.stringify({
      targets: [
        {
          target: 'a@x.com',
          data: [
            ['linkedin.com', 'Passwords, Email addresses'],
            ['dropbox', 'Email addresses'],
          ],
        },
      ],
    });
    const out = await parser.parse(report, ctx);
    expect(out.breachExposures).toHaveLength(2);
    const li = out.breachExposures.find((b) => b.breachName.includes('linkedin'));
    expect(li).toMatchObject({
      seed: 'a@x.com',
      source: 'H8MAIL',
      passwordExposed: true,
      severity: 'HIGH',
    });
    expect(li?.dataClasses).toContain('Passwords');
    const db = out.breachExposures.find((b) => b.breachName === 'dropbox');
    expect(db).toMatchObject({ passwordExposed: false, severity: 'MEDIUM' });
  });

  it('returns empty output on empty / null / garbage', async () => {
    expect((await parser.parse('', ctx)).breachExposures).toEqual([]);
    expect((await parser.parse('null', ctx)).breachExposures).toEqual([]);
    expect((await parser.parse('nope', ctx)).breachExposures).toEqual([]);
  });
});
