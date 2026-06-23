import { WebDastJsonParser } from '../web-dast-json/web-dast-json.parser';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'web-dast',
  target: 'https://t.example',
  engagementId: 'e',
};

describe('WebDastJsonParser', () => {
  const p = new WebDastJsonParser();

  it('maps a nuclei DAST hit to a web-dast finding with class tag', async () => {
    const line = JSON.stringify({
      'template-id': 'ssrf-detection',
      info: { name: 'Blind SSRF', severity: 'high', tags: ['ssrf', 'dast'] },
      'matched-at': 'https://t.example/?url=FUZZ',
      'interactsh-protocol': 'dns',
    });
    const out = await p.parse(line, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].scannerName).toBe('web-dast');
    expect(out.findings[0].severity).toBe('HIGH');
    expect((out.findings[0].evidence as { injectionClass?: string }).injectionClass).toBe('ssrf');
    expect((out.findings[0].evidence as { oastConfirmed?: boolean }).oastConfirmed).toBe(true);
  });

  it('returns empty on blank / malformed input without throwing', async () => {
    expect((await p.parse('', ctx)).findings).toHaveLength(0);
    expect((await p.parse('{not json', ctx)).findings).toHaveLength(0);
  });
});
