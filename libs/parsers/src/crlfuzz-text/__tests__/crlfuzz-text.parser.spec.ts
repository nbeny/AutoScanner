import { CrlfuzzTextParser } from '../crlfuzz-text.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'crlfuzz',
  target: 'http://x',
  engagementId: 'e',
};

describe('CrlfuzzTextParser', () => {
  it('turns each vulnerable URL line into a HIGH finding, deduped', async () => {
    const sample = [
      'http://vuln.example/?x=%0d%0aSet-Cookie:injected',
      'http://vuln.example/?x=%0d%0aSet-Cookie:injected',
      'banner noise without a url',
    ].join('\n');
    const out = await new CrlfuzzTextParser().parse(sample, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({
      severity: 'HIGH',
      title: 'CRLF injection / HTTP response splitting',
      location: 'http://vuln.example/?x=%0d%0aSet-Cookie:injected',
    });
  });

  it('returns empty output for blank input', async () => {
    const out = await new CrlfuzzTextParser().parse('', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
