import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KerbruteTextParser } from '../kerbrute-text/kerbrute-text.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'kerbrute-sample.txt'), 'utf8');
const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'kerbrute',
  target: 'corp.local',
  engagementId: 'eng_1',
};

describe('KerbruteTextParser', () => {
  const parser = new KerbruteTextParser();

  it('declares name and formats', () => {
    expect(parser.name).toBe('kerbrute-text');
    expect(parser.formats).toEqual(['TEXT']);
  });

  it('emits a LOW finding per valid user and a HIGH finding for the AS-REP roastable account', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const low = out.findings.filter((f) => f.severity === 'LOW');
    expect(low.map((f) => f.title)).toEqual([
      'Valid AD account: admin@corp.local',
      'Valid AD account: jsmith@corp.local',
    ]);
    const high = out.findings.filter((f) => f.severity === 'HIGH');
    expect(high).toHaveLength(1);
    expect(high[0].title).toBe('AS-REP roastable account: admin');
    expect(high[0].scannerName).toBe('kerbrute');
    expect((high[0].evidence as { asrepHash: string }).asrepHash).toMatch(/^\$krb5asrep\$/);
  });

  it('returns empty output on empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
