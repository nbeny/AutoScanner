import { SqlmapJsonParser } from '../sqlmap-json';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'sqli-scan',
  target: 'https://x.test/?id=1',
  engagementId: 'e',
};

describe('SqlmapJsonParser', () => {
  const parser = new SqlmapJsonParser();

  it('emits a HIGH Finding per injectable parameter (deduped)', async () => {
    const text = [
      'sqlmap identified the following injection point(s) with a total of 42 HTTP(s) requests:',
      '---',
      'Parameter: id (GET)',
      '    Type: boolean-based blind',
      '    Title: AND boolean-based blind - WHERE or HAVING clause',
      '    Payload: id=1 AND 1=1',
      '',
      '    Type: UNION query',
      '    Title: Generic UNION query (NULL) - 3 columns',
      '---',
      'Parameter: id (GET)',
    ].join('\n');
    const out = await parser.parse(text, ctx);
    const sqli = out.findings.filter((f) => f.title.toLowerCase().includes('sql injection'));
    expect(sqli).toHaveLength(1);
    expect(sqli[0].severity).toBe('HIGH');
    expect(sqli[0].location).toBe('https://x.test/?id=1');
    expect(sqli[0].description).toContain('id');
  });

  it('tolerant of blank/garbage / no-injection output', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
    expect(
      (await parser.parse('all tested parameters do not appear to be injectable', ctx)).findings,
    ).toHaveLength(0);
  });
});
