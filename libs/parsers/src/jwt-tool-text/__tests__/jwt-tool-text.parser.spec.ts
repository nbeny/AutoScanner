import { JwtToolTextParser } from '../jwt-tool-text.parser';
import type { ParserContext } from '../../types';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'jwt-tool',
  target: 'https://api.example/',
  engagementId: 'e',
};

describe('JwtToolTextParser', () => {
  const parser = new JwtToolTextParser();

  it('emits no findings for the NO_TOKEN sentinel', async () => {
    const out = await parser.parse('NO_TOKEN\n', ctx);
    expect(out.findings).toEqual([]);
  });

  it('flags alg:none as HIGH', async () => {
    const out = await parser.parse('[+] alg = "none"', ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({
      scannerName: 'jwt-tool',
      severity: 'HIGH',
      location: 'https://api.example/',
    });
    expect(out.findings[0].title).toMatch(/alg:none/i);
  });

  it('flags a cracked secret as CRITICAL', async () => {
    const out = await parser.parse('[+] CORRECT key! secret123', ctx);
    expect(out.findings[0].severity).toBe('CRITICAL');
    expect(out.findings[0].title).toMatch(/weak|known secret/i);
  });

  it('dedups repeated markers by title', async () => {
    const text = '[+] alg:none accepted\n[+] alg:none accepted again';
    const out = await parser.parse(text, ctx);
    expect(out.findings).toHaveLength(1);
  });
});
