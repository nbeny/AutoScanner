import { SmugglerTextParser } from '../smuggler-text.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'smuggler',
  target: 'https://x',
  engagementId: 'e',
};

describe('SmugglerTextParser', () => {
  it('reports one HIGH finding per distinct desync class', async () => {
    const sample = [
      '[+] Payload: nameprefix1',
      '   [CRIT] CL.TE - Potentially Vulnerable',
      '   [CRIT] CL.TE - Potentially Vulnerable',
      '   [CRIT] TE.CL - Potentially Vulnerable',
    ].join('\n');
    const out = await new SmugglerTextParser().parse(sample, ctx);
    expect(out.findings).toHaveLength(2);
    expect(out.findings.map((f) => f.title)).toEqual([
      'HTTP request smuggling (CL.TE)',
      'HTTP request smuggling (TE.CL)',
    ]);
    expect(out.findings[0].severity).toBe('HIGH');
  });

  it('returns empty output when no desync is reported', async () => {
    const out = await new SmugglerTextParser().parse('[+] Payload tested, safe', ctx);
    expect(out.findings).toHaveLength(0);
  });
});
