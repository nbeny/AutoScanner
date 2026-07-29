import { MantraTextParser } from '../mantra-text.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'mantra',
  target: 'https://a/app.js',
  engagementId: 'e',
};

describe('MantraTextParser', () => {
  const parser = new MantraTextParser();

  it('emits a MEDIUM finding per positive line, located at the URL', async () => {
    const text = '[ + ] https://a/app.js AIzaSyD-EXAMPLE_key_123';
    const out = await parser.parse(text, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({
      scannerName: 'mantra',
      severity: 'MEDIUM',
      location: 'https://a/app.js',
    });
    expect(out.findings[0].title).toMatch(/secret|key/i);
  });

  it('ignores banner and non-marker lines', async () => {
    const text = 'Mantra v1.0\nScanning...\nhttps://a/app.js (no marker)';
    const out = await parser.parse(text, ctx);
    expect(out.findings).toEqual([]);
  });

  it('dedups repeated URL+value lines', async () => {
    const text = '[+] https://a/app.js SECRET_ABC\n[+] https://a/app.js SECRET_ABC';
    const out = await parser.parse(text, ctx);
    expect(out.findings).toHaveLength(1);
  });

  it('returns empty output on empty input', async () => {
    expect((await parser.parse('', ctx)).findings).toEqual([]);
  });
});
