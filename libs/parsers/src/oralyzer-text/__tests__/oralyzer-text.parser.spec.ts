import { OralyzerTextParser } from '../oralyzer-text.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'oralyzer',
  target: 'http://x',
  engagementId: 'e',
};

describe('OralyzerTextParser', () => {
  it('reports a MEDIUM finding for a positive line carrying a URL', async () => {
    const sample = [
      '[+] Open Redirect: http://x/redirect?url=http://evil.com',
      '[-] http://x/safe?url=foo not vulnerable',
    ].join('\n');
    const out = await new OralyzerTextParser().parse(sample, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({
      severity: 'MEDIUM',
      title: 'Open redirect (possible)',
      location: 'http://x/redirect?url=http://evil.com',
    });
  });

  it('ignores negative-only output', async () => {
    const out = await new OralyzerTextParser().parse('[-] nothing here', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
