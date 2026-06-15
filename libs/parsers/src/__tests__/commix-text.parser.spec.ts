import { CommixTextParser } from '../commix-text';
import type { ParserContext } from '../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'cmdi-scan',
  target: 'https://x.test/?id=1',
  engagementId: 'e',
};

describe('CommixTextParser', () => {
  const parser = new CommixTextParser();

  it('emits a CRITICAL Finding per vulnerable parameter (deduped)', async () => {
    const text = [
      "(*) Testing the (GET) 'id' parameter for OS command injection.",
      "(!) The (GET) 'id' parameter is vulnerable to results-based command injection technique.",
      "(!) The (GET) 'id' parameter is vulnerable to results-based command injection technique.",
    ].join('\n');
    const out = await parser.parse(text, ctx);
    const cmdi = out.findings.filter((f) => /command injection/i.test(f.title));
    expect(cmdi).toHaveLength(1);
    expect(cmdi[0].severity).toBe('CRITICAL');
    expect(cmdi[0].location).toBe('https://x.test/?id=1');
  });

  it('tolerant of blank/garbage / not-vulnerable output', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
    expect((await parser.parse('(x) No parameter is injectable', ctx)).findings).toHaveLength(0);
  });
});
